# Claude Usage

See how many tokens Claude Code has used — and an estimated cost — without leaving VS Code. The extension reads your **local** Claude Code logs (`~/.claude/projects/**/*.jsonl`); nothing is sent anywhere.

## Features

- **Status bar** — today's estimated cost (or tokens) at a glance, with a tooltip breakdown of today / this month / all-time and your top model. Or switch it to a **usage-window reset timer** (`Claude 4:15 - 23%` — time until your rolling window resets and estimated quota left).
- **Dashboard** (activity-bar view) — summary cards, a daily-usage bar chart, and breakdowns by model and by project.
- **Projects tree** — drill into project → session → token/cost details.
- **Estimated cost** — computed from a bundled per-model pricing table with the four token categories (input, output, cache write, cache read). Fully overridable in settings.
- **Budget notifications** — get a pop-up when this month approaches or passes your budget, or when today's cost crosses a daily threshold. Each alert fires once per period (no reload nagging).
- **Live updates** — watches the Claude data directory and refreshes automatically.

> **Cost is an estimate.** It is the *API-equivalent* cost of the tokens used. Subscription (Max/Pro) sessions are **not** billed per token, so treat the dollar figure as a reference, not a bill. Token counts are always exact.

## Settings

All under `claude-usage.*`:

| Setting | Default | Description |
| --- | --- | --- |
| `refreshInterval` | `60` | Seconds between background re-scans (`0` disables the interval; the file watcher still runs). |
| `showCost` | `true` | Show cost figures; when off, only tokens are shown. |
| `currency` / `currencyRate` | `auto` / `0` | Display currency and USD multiplier. `auto` detects your currency from the system region (PH → ₱ PHP, US → $ USD, …); rate `0` uses a bundled **approximate** offline rate. Set an explicit code and/or exact rate to override. Formats with the right symbol and thousands grouping; live rates are never fetched. |
| `statusBar.enabled` | `true` | Show the status bar item. |
| `statusBar.metric` | `todayCost` | `todayCost` \| `todayTokens` \| `monthCost` \| `resetTimer` \| `hide`. |
| `resetWindow.hours` | `5` | Length of the rolling usage window for the `resetTimer` metric. |
| `resetWindow.tokenLimit` | `0` | Token quota per window for the `% left` figure; `0` auto-estimates from your peak usage. |
| `claudePath` | `""` | Custom Claude data directory (defaults to `~/.claude`). |
| `daysToShow` | `14` | Days in the daily chart. |
| `budget.monthly` | `0` | Monthly budget in your **display currency**; the status bar turns amber when this month exceeds it (`0` = off). |
| `notifications.enabled` | `true` | Pop a notification when spend crosses a budget/daily threshold (shown once per period, no reload nagging). |
| `notifications.budgetWarnAtPercent` | `80` | Early heads-up at this % of the monthly budget (a second alert fires at 100%; `0` = only on exceed). |
| `notifications.dailyCostThreshold` | `0` | Notify once/day when **today's** cost passes this amount in your display currency (`0` = off). |
| `pricingOverrides` | `{}` | Per-model rate overrides in USD per 1M tokens. |

### Pricing overrides

```json
"claude-usage.pricingOverrides": {
  "claude-opus-4-8": { "input": 5, "output": 25, "cacheRead": 0.5 }
}
```

Any omitted field falls back to the bundled rate. Cache-write/read rates default to Anthropic's standard multipliers (1.25× / 0.1× of input).

## How it works

Every assistant turn Claude Code writes to a session `.jsonl` carries a `usage` block and a `model`. The extension streams those files, de-duplicates on `messageId:requestId`, sums the four token types per day / month / session / project / model, and multiplies by the pricing table. Only appended data is re-read on change, so large histories stay fast.

## Commands

- **Claude Usage: Refresh** — force a re-scan.
- **Claude Usage: Open Dashboard** — focus the dashboard view.

## Development

```bash
npm install
npm run watch     # esbuild in watch mode
# press F5 to launch the Extension Development Host
npm test          # run unit tests (npx vscode-test --grep "<name>" for one)
npm run package   # production bundle
npx vsce package  # produce a .vsix
```

## License

MIT
