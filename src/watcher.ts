import * as chokidar from "chokidar";
import * as vscode from "vscode";

/**
 * Watches the Claude projects directory and fires a debounced callback on any
 * change. Because the directory lives outside the workspace, VS Code's own
 * FileSystemWatcher can't observe it reliably, so we use chokidar. An interval
 * fallback catches events missed on network drives / containers.
 */
export class UsageWatcher implements vscode.Disposable {
  private watcher: chokidar.FSWatcher | undefined;
  private interval: NodeJS.Timeout | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(
    private readonly onChange: () => void,
    private readonly output: vscode.OutputChannel,
    private readonly debounceMs = 750
  ) {}

  /** (Re)start watching `dir` with an interval fallback of `intervalSeconds`. */
  start(dir: string, intervalSeconds: number): void {
    this.stopWatcher();
    this.stopInterval();
    if (this.disposed) {
      return;
    }

    try {
      this.watcher = chokidar.watch(dir, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
        depth: 10,
      });
      const trigger = () => this.scheduleChange();
      this.watcher
        .on("add", trigger)
        .on("change", trigger)
        .on("unlink", trigger)
        .on("error", (err) =>
          this.output.appendLine(`[watcher] error: ${String(err)}`)
        );
    } catch (err) {
      this.output.appendLine(`[watcher] failed to start: ${String(err)}`);
    }

    if (intervalSeconds > 0) {
      this.interval = setInterval(
        () => this.scheduleChange(),
        intervalSeconds * 1000
      );
    }
  }

  private scheduleChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      if (!this.disposed) {
        this.onChange();
      }
    }, this.debounceMs);
  }

  private stopWatcher(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = undefined;
    }
  }

  private stopInterval(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.stopWatcher();
    this.stopInterval();
  }
}
