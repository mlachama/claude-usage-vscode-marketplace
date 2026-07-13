import * as vscode from "vscode";
import { ExtensionConfig } from "../config";
import { formatCost, formatTokens } from "../format";
import { AggregationResult, UsageRollup } from "../data/types";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function find(rollups: UsageRollup[], key: string): UsageRollup | undefined {
  return rollups.find((r) => r.key === key);
}

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      "claude-usage.status",
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.name = "Claude Usage";
    this.item.command = "claude-usage.openDashboard";
  }

  update(result: AggregationResult | undefined, config: ExtensionConfig): void {
    if (!config.statusBarEnabled || config.statusMetric === "hide") {
      this.item.hide();
      return;
    }
    if (!result) {
      this.item.text = "$(graph) Claude: —";
      this.item.tooltip = "Claude Usage: scanning…";
      this.item.show();
      return;
    }

    const today = find(result.byDay, todayKey());
    const month = find(result.byMonth, monthKey());

    this.item.text = this.metricText(result, today, month, config);
    this.item.tooltip = this.buildTooltip(result, today, month, config);

    // Budget warning coloring.
    if (
      config.monthlyBudget > 0 &&
      month &&
      month.costUSD >= config.monthlyBudget
    ) {
      this.item.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    } else {
      this.item.backgroundColor = undefined;
    }

    this.item.show();
  }

  private metricText(
    result: AggregationResult,
    today: UsageRollup | undefined,
    month: UsageRollup | undefined,
    config: ExtensionConfig
  ): string {
    const showCost = config.showCost;
    switch (config.statusMetric) {
      case "todayTokens":
        return `$(graph) ${formatTokens(today?.totalTokens ?? 0)} today`;
      case "monthCost":
        return showCost
          ? `$(graph) ${formatCost(month?.costUSD ?? 0, config)}`
          : `$(graph) ${formatTokens(month?.totalTokens ?? 0)}`;
      case "todayCost":
      default:
        return showCost
          ? `$(graph) ${formatCost(today?.costUSD ?? 0, config)}`
          : `$(graph) ${formatTokens(today?.totalTokens ?? 0)}`;
    }
  }

  private buildTooltip(
    result: AggregationResult,
    today: UsageRollup | undefined,
    month: UsageRollup | undefined,
    config: ExtensionConfig
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.supportThemeIcons = true;
    const line = (label: string, r?: { costUSD: number; totalTokens: number }) => {
      const cost = config.showCost ? `${formatCost(r?.costUSD ?? 0, config)} · ` : "";
      return `**${label}:** ${cost}${formatTokens(r?.totalTokens ?? 0)} tokens`;
    };
    md.appendMarkdown("**Claude Code usage**\n\n");
    md.appendMarkdown(line("Today", today) + "\n\n");
    md.appendMarkdown(line("This month", month) + "\n\n");
    md.appendMarkdown(line("All-time", result.grandTotal) + "\n\n");
    const topModel = result.byModel[0];
    if (topModel) {
      const c = config.showCost ? ` (${formatCost(topModel.costUSD, config)})` : "";
      md.appendMarkdown(`\n---\n\nTop model: \`${topModel.label}\`${c}\n\n`);
    }
    if (config.showCost) {
      md.appendMarkdown("\n_Cost is an estimated API-equivalent, not a bill._\n\n");
    }
    md.appendMarkdown("Click to open the dashboard.");
    return md;
  }

  dispose(): void {
    this.item.dispose();
  }
}
