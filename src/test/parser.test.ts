import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseFile } from "../data/parser";
import { CostOptions } from "../data/types";

const COST: CostOptions = { cacheWriteTtl: "5m" };

function writeFixture(lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cu-test-"));
  const file = path.join(dir, "session.jsonl");
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
  return file;
}

function assistantLine(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "assistant",
    requestId: "req-1",
    timestamp: "2026-07-08T10:00:00.000Z",
    sessionId: "sess-1",
    cwd: "D:\\Projects\\demo",
    message: {
      id: "msg-1",
      model: "claude-sonnet-4-6",
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 200,
      },
    },
    ...over,
  });
}

describe("parseFile", () => {
  it("parses an assistant line with a usage block", async () => {
    const file = writeFixture([assistantLine()]);
    const res = await parseFile(file, 0, {
      projectKey: "D--Projects-demo",
      isSubagent: false,
      costOptions: COST,
    });
    assert.strictEqual(res.entries.length, 1);
    const e = res.entries[0];
    assert.strictEqual(e.inputTokens, 10);
    assert.strictEqual(e.outputTokens, 20);
    assert.strictEqual(e.cacheCreationTokens, 100);
    assert.strictEqual(e.cacheReadTokens, 200);
    assert.strictEqual(e.totalTokens, 330);
    assert.strictEqual(e.model, "claude-sonnet-4-6");
    assert.strictEqual(e.projectPath, "D:\\Projects\\demo");
    assert.strictEqual(e.projectLabel, "demo");
    assert.ok(e.costUSD > 0);
  });

  it("skips non-usage and malformed lines", async () => {
    const file = writeFixture([
      JSON.stringify({ type: "mode", mode: "normal" }),
      JSON.stringify({ type: "file-history-snapshot" }),
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
      "{ this is not valid json",
      assistantLine(),
    ]);
    const res = await parseFile(file, 0, {
      projectKey: "D--Projects-demo",
      isSubagent: false,
      costOptions: COST,
    });
    assert.strictEqual(res.entries.length, 1);
  });

  it("defaults missing cache token fields to zero", async () => {
    const line = JSON.stringify({
      type: "assistant",
      requestId: "req-2",
      timestamp: "2026-07-08T10:00:00.000Z",
      sessionId: "sess-1",
      cwd: "/home/u/proj",
      message: {
        id: "msg-2",
        model: "claude-haiku-4-5",
        usage: { input_tokens: 5, output_tokens: 7 },
      },
    });
    const file = writeFixture([line]);
    const res = await parseFile(file, 0, {
      projectKey: "-home-u-proj",
      isSubagent: false,
      costOptions: COST,
    });
    const e = res.entries[0];
    assert.strictEqual(e.cacheCreationTokens, 0);
    assert.strictEqual(e.cacheReadTokens, 0);
    assert.strictEqual(e.totalTokens, 12);
  });

  it("advances endOffset past complete lines only", async () => {
    const file = writeFixture([assistantLine(), assistantLine({ requestId: "r2" })]);
    const res = await parseFile(file, 0, {
      projectKey: "D--Projects-demo",
      isSubagent: false,
      costOptions: COST,
    });
    const size = fs.statSync(file).size;
    assert.strictEqual(res.endOffset, size);
  });
});
