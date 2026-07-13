# Claude Usage

See how many tokens Claude Code has used — and an estimated cost — without leaving VS Code. The extension reads your **local** Claude Code logs (`~/.claude/projects/**/*.jsonl`); nothing is sent anywhere.

## Features

- **Status bar** — today's estimated cost (or tokens) at a glance, with a tooltip breakdown of today / this month / all-time and your top model.
- **Dashboard** (activity-bar view) — summary cards, a daily-usage bar chart, and breakdowns by model and by project.
- **Projects tree** — drill into project → session → token/cost details.
- **Estimated cost** — computed from a bundled per-model pricing table with the four token categories (input, output, cache write, cache read). Fully overridable in settings.
- **Live updates** — watches the Claude data directory and refreshes automatically.

> **Cost is an estimate.** It is the *API-equivalent* cost of the tokens used. Subscription (Max/Pro) sessions are **not** billed per token, so treat the dollar figure as a reference, not a bill. Token counts are always exact.

## Settings

All under `claude-usage.*`:

| Setting | Default | Description |
| --- | --- | --- |
| `refreshInterval` | `60` | Seconds between background re-scans (`0` disables the interval; the file watcher still runs). |
| `showCost` | `true` | Show cost figures; when off, only tokens are shown. |
| `currency` / `currencyRate` | `USD` / `1` | Display currency label and multiplier applied to USD costs. |
| `statusBar.enabled` | `true` | Show the status bar item. |
| `statusBar.metric` | `todayCost` | `todayCost` \| `todayTokens` \| `monthCost` \| `hide`. |
| `claudePath` | `""` | Custom Claude data directory (defaults to `~/.claude`). |
| `daysToShow` | `14` | Days in the daily chart. |
| `budget.monthly` | `0` | Monthly USD budget; the status bar turns amber when exceeded (`0` = off). |
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
