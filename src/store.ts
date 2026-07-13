import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { aggregate } from "./data/aggregate";
import { parseFile } from "./data/parser";
import { AggregationResult } from "./data/types";
import { CostOptions, UsageEntry } from "./data/types";

interface FileCacheEntry {
  mtimeMs: number;
  size: number;
  offset: number;
  entries: UsageEntry[];
  projectKey: string;
  isSubagent: boolean;
}

export interface StoreConfig {
  projectsDir: string;
  costOptions: CostOptions;
}

/**
 * Owns parsing of the Claude logs. Keeps a per-file cache keyed by path and
 * re-parses only the appended tail of changed files (tracked by mtime/size and
 * a byte offset). The aggregated result is a cheap reduce over cached entries.
 */
export class UsageStore {
  private readonly files = new Map<string, FileCacheEntry>();
  private result: AggregationResult | undefined;
  private scanning = false;
  private rescanQueued = false;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private getConfig: () => StoreConfig,
    private readonly output: vscode.OutputChannel
  ) {}

  getResult(): AggregationResult | undefined {
    return this.result;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }

  /** Drop all cached state (e.g. after the claudePath setting changes). */
  reset(): void {
    this.files.clear();
    this.result = undefined;
  }

  /** Scan the projects dir, parsing new/changed files, then re-aggregate. */
  async scan(): Promise<void> {
    if (this.scanning) {
      this.rescanQueued = true;
      return;
    }
    this.scanning = true;
    try {
      const { projectsDir, costOptions } = this.getConfig();
      const found = await this.discover(projectsDir);
      const foundSet = new Set(found.map((f) => f.filePath));

      // Drop cache entries for files that disappeared.
      for (const key of Array.from(this.files.keys())) {
        if (!foundSet.has(key)) {
          this.files.delete(key);
        }
      }

      for (const f of found) {
        try {
          await this.updateFile(f.filePath, f.projectKey, f.isSubagent, costOptions);
        } catch (err) {
          this.output.appendLine(`[scan] failed on ${f.filePath}: ${String(err)}`);
        }
      }

      this.recompute();
    } finally {
      this.scanning = false;
      if (this.rescanQueued) {
        this.rescanQueued = false;
        void this.scan();
      }
    }
  }

  private recompute(): void {
    const all: UsageEntry[] = [];
    for (const fc of this.files.values()) {
      for (const e of fc.entries) {
        all.push(e);
      }
    }
    this.result = aggregate(all);
    this._onDidChange.fire();
  }

  private async updateFile(
    filePath: string,
    projectKey: string,
    isSubagent: boolean,
    costOptions: CostOptions
  ): Promise<void> {
    const stat = await fsp.stat(filePath);
    const cached = this.files.get(filePath);

    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return; // unchanged
    }

    // Truncated or rewritten → reparse from the beginning.
    const startOffset =
      cached && stat.size >= cached.offset ? cached.offset : 0;

    const res = await parseFile(filePath, startOffset, {
      projectKey,
      isSubagent,
      costOptions,
    });

    const entries =
      startOffset > 0 && cached ? cached.entries.concat(res.entries) : res.entries;

    this.files.set(filePath, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      offset: res.endOffset,
      entries,
      projectKey,
      isSubagent,
    });
  }

  /** Recursively find every *.jsonl under the projects dir. */
  private async discover(
    projectsDir: string
  ): Promise<Array<{ filePath: string; projectKey: string; isSubagent: boolean }>> {
    const out: Array<{ filePath: string; projectKey: string; isSubagent: boolean }> =
      [];
    let projectDirs: fs.Dirent[];
    try {
      projectDirs = await fsp.readdir(projectsDir, { withFileTypes: true });
    } catch {
      return out; // projects dir missing
    }

    for (const pd of projectDirs) {
      if (!pd.isDirectory()) {
        continue;
      }
      const projectKey = pd.name;
      const root = path.join(projectsDir, projectKey);
      await this.walk(root, projectKey, out);
    }
    return out;
  }

  private async walk(
    dir: string,
    projectKey: string,
    out: Array<{ filePath: string; projectKey: string; isSubagent: boolean }>
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await this.walk(full, projectKey, out);
      } else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
        const isSubagent = /[\\/]subagents[\\/]/.test(full);
        out.push({ filePath: full, projectKey, isSubagent });
      }
    }
  }
}
