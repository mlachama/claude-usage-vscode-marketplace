import * as vscode from "vscode";
import { ExtensionConfig } from "../config";
import {
  formatCost,
  formatDuration,
  formatTokens,
  monthKey,
  todayKey,
} from "../format";
import { AggregationResult, UsageRollup } from "../data/types";
import { ActiveWindow, activeWindowStatus } from "../data/blocks";

function find(rollups: UsageRollup[], key: string): UsageRollup | undefined {
  return rollups.find((r) => r.key === key);
}

/** Re-render cadence for the live reset countdown. */
const TICK_MS = 30_000;

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly ticker: NodeJS.Timeout;
  private lastResult: AggregationResult | undefined;
  private lastConfig: ExtensionConfig | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      "claude-usage.status",
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.name = "Claude Usage";
    this.item.command = "claude-usage.openDashboard";
    // Tick the reset countdown even when usage data hasn't changed.
    this.ticker = setInterval(() => {
      if (this.lastConfig?.statusMetric === "resetTimer") {
        this.render();
      }
    }, TICK_MS);
  }

  update(result: AggregationResult | undefined, config: ExtensionConfig): void {
    this.lastResult = result;
    this.lastConfig = config;
    this.render();
  }

  private render(): void {
    const config = this.lastConfig;
    const result = this.lastResult;
    if (!config) {
      return;
    }
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
    const win =
      config.statusMetric === "resetTimer"
        ? activeWindowStatus(result.blocks, {
            tokenLimit: config.resetTokenLimit,
          })
        : undefined;

    this.item.text = this.metricText(today, month, win, config);
    this.item.tooltip =
      config.statusMetric === "resetTimer"
        ? this.resetTooltip(win, config)
        : this.buildTooltip(result, today, month, config);
    this.item.backgroundColor = this.warnColor(month, win, config);
    this.item.show();
  }

  private warnColor(
    month: UsageRollup | undefined,
    win: ActiveWindow | undefined,
    config: ExtensionConfig
  ): vscode.ThemeColor | undefined {
    const warn = new vscode.ThemeColor("statusBarItem.warningBackground");
    if (config.statusMetric === "resetTimer") {
      return win?.percentLeft !== undefined && win.percentLeft < 10
        ? warn
        : undefined;
    }
    // Budget is in the display currency; convert this month's USD the same way.
    const over =
      config.monthlyBudget > 0 &&
      month !== undefined &&
      month.costUSD * config.currencyRate >= config.monthlyBudget;
    return over ? warn : undefined;
  }

  private metricText(
    today: UsageRollup | undefined,
    month: UsageRollup | undefined,
    win: ActiveWindow | undefined,
    config: ExtensionConfig
  ): string {
    const showCost = config.showCost;
    switch (config.statusMetric) {
      case "resetTimer":
        if (!win) {
          return "$(watch) Claude ready";
        }
        if (win.percentLeft === undefined) {
          return `$(watch) Claude ${formatDuration(win.msRemaining)}`;
        }
        return `$(watch) Claude ${formatDuration(win.msRemaining)} - ${Math.round(
          win.percentLeft
        )}%`;
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

  private resetTooltip(
    win: ActiveWindow | undefined,
    config: ExtensionConfig
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.supportThemeIcons = true;
    md.appendMarkdown("**Claude usage window**\n\n");
    if (!win) {
      md.appendMarkdown(
        `No active window — your ${config.resetWindowHours}-hour quota is fresh.\n\n`
      );
      md.appendMarkdown(
        "_The window is reconstructed from local message timestamps; the real reset is server-side._"
      );
      return md;
    }
    const resetsAt = new Date(win.resetTime).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    md.appendMarkdown(
      `**Resets in:** ${formatDuration(win.msRemaining)} (at ${resetsAt})\n\n`
    );
    if (win.estimatedLimit > 0) {
      const cap = win.limitIsAuto
        ? `~${formatTokens(win.estimatedLimit)} (auto)`
        : `${formatTokens(win.estimatedLimit)} (your limit)`;
      md.appendMarkdown(
        `**Used:** ${formatTokens(win.tokensUsed)} / ${cap} tokens\n\n`
      );
      md.appendMarkdown(`**Left:** ${Math.round(win.percentLeft ?? 0)}%\n\n`);
    } else {
      md.appendMarkdown(`**Used:** ${formatTokens(win.tokensUsed)} tokens\n\n`);
      md.appendMarkdown(
        "_No quota yet — set `claude-usage.resetWindow.tokenLimit` to see % left._\n\n"
      );
    }
    md.appendMarkdown("\n---\n\n");
    md.appendMarkdown(
      win.limitIsAuto
        ? "_% left is estimated: the real plan limit isn't stored locally, so the cap is calibrated from your peak usage._"
        : "_% left is against the limit you set; the real reset is server-side._"
    );
    return md;
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
      if (config.rateIsApproximate && config.currency !== "USD") {
        md.appendMarkdown(
          `_${config.currency} shown at an approximate rate — set \`claude-usage.currencyRate\` for an exact one._\n\n`
        );
      }
    }
    md.appendMarkdown("Click to open the dashboard.");
    return md;
  }

  dispose(): void {
    clearInterval(this.ticker);
    this.item.dispose();
  }
}
