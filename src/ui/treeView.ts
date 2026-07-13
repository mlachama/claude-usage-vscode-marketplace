import * as vscode from "vscode";
import { ExtensionConfig } from "../config";
import { formatCost, formatTokens } from "../format";
import { AggregationResult, ProjectNode, UsageRollup } from "../data/types";

type Node =
  | { kind: "project"; node: ProjectNode }
  | { kind: "session"; project: ProjectNode; session: UsageRollup }
  | { kind: "metric"; label: string; value: string };

export class UsageTreeProvider implements vscode.TreeDataProvider<Node> {
  private result: AggregationResult | undefined;
  private config: ExtensionConfig | undefined;

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  setData(result: AggregationResult | undefined, config: ExtensionConfig): void {
    this.result = result;
    this.config = config;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const cfg = this.config;
    switch (node.kind) {
      case "project": {
        const r = node.node.project;
        const item = new vscode.TreeItem(
          r.label,
          vscode.TreeItemCollapsibleState.Collapsed
        );
        item.description = this.describe(r, cfg);
        item.iconPath = new vscode.ThemeIcon("folder");
        item.tooltip = r.key;
        return item;
      }
      case "session": {
        const r = node.session;
        const item = new vscode.TreeItem(
          r.label,
          vscode.TreeItemCollapsibleState.Collapsed
        );
        item.description = this.describe(r, cfg);
        item.iconPath = new vscode.ThemeIcon("comment-discussion");
        item.tooltip = r.key;
        return item;
      }
      case "metric": {
        const item = new vscode.TreeItem(
          node.label,
          vscode.TreeItemCollapsibleState.None
        );
        item.description = node.value;
        item.iconPath = new vscode.ThemeIcon("graph-line");
        return item;
      }
    }
  }

  getChildren(node?: Node): Node[] {
    if (!this.result) {
      return [];
    }
    if (!node) {
      return this.result.projectTree.map((n) => ({ kind: "project", node: n }));
    }
    if (node.kind === "project") {
      return node.node.sessions.map((s) => ({
        kind: "session",
        project: node.node,
        session: s,
      }));
    }
    if (node.kind === "session") {
      return this.sessionMetrics(node.session);
    }
    return [];
  }

  private sessionMetrics(r: UsageRollup): Node[] {
    const cfg = this.config;
    const metrics: Node[] = [
      { kind: "metric", label: "Messages", value: String(r.messageCount) },
      { kind: "metric", label: "Input", value: formatTokens(r.inputTokens) },
      { kind: "metric", label: "Output", value: formatTokens(r.outputTokens) },
      {
        kind: "metric",
        label: "Cache write",
        value: formatTokens(r.cacheCreationTokens),
      },
      {
        kind: "metric",
        label: "Cache read",
        value: formatTokens(r.cacheReadTokens),
      },
    ];
    if (cfg?.showCost) {
      metrics.push({
        kind: "metric",
        label: "Est. cost",
        value: formatCost(r.costUSD, cfg),
      });
    }
    return metrics;
  }

  private describe(r: UsageRollup, cfg: ExtensionConfig | undefined): string {
    const tokens = `${formatTokens(r.totalTokens)} tok`;
    if (cfg?.showCost) {
      return `${formatCost(r.costUSD, cfg)} · ${tokens}`;
    }
    return tokens;
  }
}
