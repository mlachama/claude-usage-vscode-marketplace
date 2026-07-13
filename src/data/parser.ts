import * as fs from "fs";
import { costForEntry } from "./pricing";
import { dedupKey } from "./dedup";
import { projectLabelFromPath, desanitizeProjectKey } from "./paths";
import { CostOptions, UsageEntry } from "./types";

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: {
    web_search_requests?: number;
    web_fetch_requests?: number;
  };
}

interface RawLine {
  type?: string;
  requestId?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: RawUsage;
  };
}

export interface ParseContext {
  projectKey: string;
  isSubagent: boolean;
  costOptions: CostOptions;
}

export interface ParseResult {
  entries: UsageEntry[];
  /** Byte offset up to the last complete (newline-terminated) line. */
  endOffset: number;
  /** First cwd seen in the parsed range, if any. */
  cwd?: string;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function toDateParts(iso: string): { date: string; month: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: "unknown", month: "unknown" };
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, month: `${y}-${m}` };
}

/**
 * Parse a JSONL file incrementally from `startOffset`. Only assistant lines
 * that carry a usage block become entries; every other line (mode markers,
 * snapshots, attachments, user turns, malformed JSON) is skipped. Partial
 * trailing lines (no newline yet) are held back so `endOffset` only advances
 * past complete lines.
 *
 * Cost is computed per entry; deduplication is applied later, across the scan.
 */
export function parseFile(
  filePath: string,
  startOffset: number,
  ctx: ParseContext
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const entries: UsageEntry[] = [];
    let cwd: string | undefined;
    let buffer = "";
    let consumedBytes = startOffset;

    const stream = fs.createReadStream(filePath, {
      encoding: "utf8",
      start: startOffset,
    });

    const handleLine = (line: string): void => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return;
      }
      let obj: RawLine;
      try {
        obj = JSON.parse(trimmed) as RawLine;
      } catch {
        return; // corrupt / truncated line
      }
      if (cwd === undefined && typeof obj.cwd === "string" && obj.cwd.length > 0) {
        cwd = obj.cwd;
      }
      if (obj.type !== "assistant" || !obj.message?.usage) {
        return;
      }
      const usage = obj.message.usage;
      const inputTokens = num(usage.input_tokens);
      const outputTokens = num(usage.output_tokens);
      const cacheCreationTokens = num(usage.cache_creation_input_tokens);
      const cacheReadTokens = num(usage.cache_read_input_tokens);
      const webSearchRequests = num(usage.server_tool_use?.web_search_requests);
      const webFetchRequests = num(usage.server_tool_use?.web_fetch_requests);

      const timestamp = typeof obj.timestamp === "string" ? obj.timestamp : "";
      const { date, month } = toDateParts(timestamp);
      const model = obj.message.model ?? "unknown";
      const messageId = obj.message.id ?? "";
      const requestId = obj.requestId ?? "";
      const sessionId = obj.sessionId ?? "";

      const partial = {
        model,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        webSearchRequests,
        webFetchRequests,
      };

      entries.push({
        messageId,
        requestId,
        dedupKey: dedupKey(messageId, requestId),
        timestamp,
        date,
        month,
        sessionId,
        projectKey: ctx.projectKey,
        projectPath: "", // filled in after full-file cwd resolution
        projectLabel: "",
        cwd: obj.cwd ?? "",
        model,
        isSubagent: ctx.isSubagent,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        totalTokens:
          inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
        webSearchRequests,
        webFetchRequests,
        costUSD: costForEntry(partial, ctx.costOptions),
        costIsEstimate: true,
      });
    };

    stream.on("data", (chunk: string | Buffer) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl);
        handleLine(line);
        consumedBytes += Buffer.byteLength(line, "utf8") + 1; // +1 for '\n'
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
      }
    });

    stream.on("error", reject);
    stream.on("end", () => {
      // Resolve project path from cwd (exact) or de-sanitize the key (approx).
      const projectPath = cwd ?? desanitizeProjectKey(ctx.projectKey);
      const projectLabel = projectLabelFromPath(projectPath);
      for (const e of entries) {
        e.projectPath = projectPath;
        e.projectLabel = projectLabel;
        if (!e.cwd) {
          e.cwd = projectPath;
        }
      }
      resolve({ entries, endOffset: consumedBytes, cwd });
    });
  });
}
