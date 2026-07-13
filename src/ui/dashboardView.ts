import * as vscode from "vscode";
import { ExtensionConfig } from "../config";
import { formatCost, formatTokens, monthKey, todayKey } from "../format";
import { activeWindowStatus } from "../data/blocks";
import { AggregationResult, GrandTotal, UsageRollup } from "../data/types";

interface Card {
  cost: string;
  tokens: string;
}

interface BarRow {
  label: string;
  cost: string;
  tokens: string;
  pct: number;
}

interface ResetWindowData {
  active: boolean;
  /** ISO reset time, for a live client-side countdown (null when idle). */
  resetTime: string | null;
  /** Rounded % of quota used, or null when the cap isn't known. */
  percentUsed: number | null;
  used: string; // formatted tokens
  limit: string; // formatted tokens ("" when unknown)
  limitIsAuto: boolean;
  windowHours: number;
}

interface DashboardData {
  showCost: boolean;
  updatedAt: string;
  cards: { today: Card; month: Card; allTime: Card };
  resetWindow: ResetWindowData | null;
  daily: BarRow[];
  models: BarRow[];
  projects: BarRow[];
}

function card(
  r: { costUSD: number; totalTokens: number } | undefined,
  config: ExtensionConfig
): Card {
  return {
    cost: formatCost(r?.costUSD ?? 0, config),
    tokens: `${formatTokens(r?.totalTokens ?? 0)} tokens`,
  };
}

function bars(
  rollups: UsageRollup[],
  config: ExtensionConfig,
  useCostForWidth: boolean
): BarRow[] {
  const max = rollups.reduce(
    (m, r) => Math.max(m, useCostForWidth ? r.costUSD : r.totalTokens),
    0
  );
  return rollups.map((r) => {
    const v = useCostForWidth ? r.costUSD : r.totalTokens;
    return {
      label: r.label || r.key,
      cost: formatCost(r.costUSD, config),
      tokens: formatTokens(r.totalTokens),
      pct: max > 0 ? Math.round((v / max) * 100) : 0,
    };
  });
}

export class DashboardProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private latest: DashboardData | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((msg: { type?: string }) => {
      if (msg?.type === "ready") {
        this.post();
      } else if (msg?.type === "refresh") {
        void vscode.commands.executeCommand("claude-usage.refresh");
      }
    });
  }

  update(result: AggregationResult | undefined, config: ExtensionConfig): void {
    this.latest = this.buildData(result, config);
    this.post();
  }

  private post(): void {
    if (this.view && this.latest) {
      void this.view.webview.postMessage({ type: "data", payload: this.latest });
    }
  }

  private buildData(
    result: AggregationResult | undefined,
    config: ExtensionConfig
  ): DashboardData {
    const empty: GrandTotal = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      costUSD: 0,
      costIsEstimate: true,
      messageCount: 0,
    };
    const today = result?.byDay.find((r) => r.key === todayKey());
    const month = result?.byMonth.find((r) => r.key === monthKey());
    const daily = (result?.byDay ?? []).slice(-config.daysToShow);
    return {
      showCost: config.showCost,
      updatedAt: new Date().toLocaleTimeString(),
      cards: {
        today: card(today, config),
        month: card(month, config),
        allTime: card(result?.grandTotal ?? empty, config),
      },
      resetWindow: this.resetWindow(result, config),
      daily: bars(daily, config, config.showCost),
      models: bars((result?.byModel ?? []).slice(0, 8), config, config.showCost),
      projects: bars((result?.byProject ?? []).slice(0, 8), config, config.showCost),
    };
  }

  private resetWindow(
    result: AggregationResult | undefined,
    config: ExtensionConfig
  ): ResetWindowData | null {
    if (!result) {
      return null;
    }
    const win = activeWindowStatus(result.blocks, {
      tokenLimit: config.resetTokenLimit,
    });
    if (!win) {
      return {
        active: false,
        resetTime: null,
        percentUsed: 0,
        used: "",
        limit: "",
        limitIsAuto: config.resetTokenLimit <= 0,
        windowHours: config.resetWindowHours,
      };
    }
    return {
      active: true,
      resetTime: win.resetTime,
      percentUsed:
        win.percentLeft === undefined ? null : Math.round(100 - win.percentLeft),
      used: formatTokens(win.tokensUsed),
      limit: win.estimatedLimit > 0 ? formatTokens(win.estimatedLimit) : "",
      limitIsAuto: win.limitIsAuto,
      windowHours: config.resetWindowHours,
    };
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "dashboard.css")
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "dashboard.js")
    );
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${cssUri}" rel="stylesheet" />
  <title>Claude Usage</title>
</head>
<body>
  <header>
    <span id="updated" class="muted"></span>
    <button id="refresh" title="Refresh">↻</button>
  </header>
  <section class="cards">
    <div class="card"><div class="card-title">Today</div><div class="card-cost" id="today-cost"></div><div class="card-tokens muted" id="today-tokens"></div></div>
    <div class="card"><div class="card-title">This month</div><div class="card-cost" id="month-cost"></div><div class="card-tokens muted" id="month-tokens"></div></div>
    <div class="card"><div class="card-title">All-time</div><div class="card-cost" id="all-cost"></div><div class="card-tokens muted" id="all-tokens"></div></div>
  </section>

  <section id="reset" class="uw" hidden>
    <h3>Usage limits</h3>
    <div class="uw-row">
      <div class="uw-left">
        <div class="uw-name">Current session</div>
        <div class="uw-reset muted" id="reset-sub"></div>
      </div>
      <div class="uw-bar"><div class="uw-bar-fill" id="reset-fill"></div></div>
      <div class="uw-pct" id="reset-pct"></div>
    </div>
    <div class="uw-note muted" id="reset-meta"></div>
  </section>

  <h3>Daily usage</h3>
  <div id="daily" class="bars"></div>

  <h3>By model</h3>
  <div id="models" class="table"></div>

  <h3>By project</h3>
  <div id="projects" class="table"></div>

  <p class="muted footnote" id="footnote"></p>

  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
