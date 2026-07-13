import * as vscode from "vscode";
import { ExtensionConfig } from "../config";
import { formatCost, formatTokens } from "../format";
import { AggregationResult, GrandTotal, UsageRollup } from "../data/types";

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

interface DashboardData {
  showCost: boolean;
  updatedAt: string;
  cards: { today: Card; month: Card; allTime: Card };
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
      daily: bars(daily, config, config.showCost),
      models: bars((result?.byModel ?? []).slice(0, 8), config, config.showCost),
      projects: bars((result?.byProject ?? []).slice(0, 8), config, config.showCost),
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
