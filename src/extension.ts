import * as vscode from "vscode";
import { affectsUs, ExtensionConfig, readConfig } from "./config";
import { UsageStore } from "./store";
import { UsageWatcher } from "./watcher";
import { StatusBar } from "./ui/statusBar";
import { DashboardProvider } from "./ui/dashboardView";
import { UsageTreeProvider } from "./ui/treeView";
import { Notifier } from "./ui/notifier";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Claude Usage");
  context.subscriptions.push(output);

  let config: ExtensionConfig = readConfig();

  const store = new UsageStore(
    () => ({
      projectsDir: config.projectsDir,
      costOptions: config.costOptions,
      windowHours: config.resetWindowHours,
    }),
    output
  );
  const statusBar = new StatusBar();
  const dashboard = new DashboardProvider(context.extensionUri);
  const tree = new UsageTreeProvider();
  const notifier = new Notifier(context.globalState);
  const watcher = new UsageWatcher(() => void store.scan(), output);

  context.subscriptions.push(store, statusBar, watcher);

  const renderAll = () => {
    const result = store.getResult();
    statusBar.update(result, config);
    dashboard.update(result, config);
    tree.setData(result, config);
    notifier.check(result, config);
  };

  context.subscriptions.push(store.onDidChange(renderAll));

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("claude-usage.dashboard", dashboard, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerTreeDataProvider("claude-usage.tree", tree)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claude-usage.refresh", () => {
      void store.scan();
    }),
    vscode.commands.registerCommand("claude-usage.openDashboard", () => {
      void vscode.commands.executeCommand("claude-usage.dashboard.focus");
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!affectsUs(e)) {
        return;
      }
      const prev = config;
      config = readConfig();
      // Re-scan from scratch if the data location or pricing changed.
      if (
        prev.projectsDir !== config.projectsDir ||
        JSON.stringify(prev.costOptions) !== JSON.stringify(config.costOptions)
      ) {
        store.reset();
        watcher.start(config.projectsDir, config.refreshInterval);
        void store.scan();
      } else if (prev.resetWindowHours !== config.resetWindowHours) {
        // Window length only affects block grouping → cheap re-aggregate
        // (unchanged files early-return in the scan).
        void store.scan();
      } else if (prev.refreshInterval !== config.refreshInterval) {
        watcher.start(config.projectsDir, config.refreshInterval);
        renderAll();
      } else {
        renderAll();
      }
    })
  );

  // Initial render (shows scanning state), then first scan.
  renderAll();
  watcher.start(config.projectsDir, config.refreshInterval);
  void store.scan().then(() => {
    const g = store.getResult()?.grandTotal;
    if (g) {
      output.appendLine(
        `[scan] ${g.messageCount} messages · ${g.totalTokens} tokens · $${g.costUSD.toFixed(
          2
        )} (est.)`
      );
    }
  });

  output.appendLine("Claude Usage extension activated.");
}

export function deactivate(): void {
  // Disposables handled via context.subscriptions.
}
