# Change Log

All notable changes to the "claude-usage" extension are documented here.

## [0.1.0] - 2026-07-15

- Initial release.
- Status bar item showing today's estimated cost / tokens with a tooltip breakdown, or a usage-window reset timer (`Claude 4:15 - 23%`).
- Dashboard webview with summary cards, a "Usage limits" card with a live reset countdown, daily-usage chart, and model/project breakdowns.
- Local-currency display (auto-detected from the system region, offline approximate rates, both overridable).
- Budget notifications: monthly-budget warning/exceeded alerts and a daily spend threshold, each fired at most once per period.
- Projects tree view (project → session → metrics).
- Streaming JSONL parser with `messageId:requestId` deduplication and incremental (tail) re-reads.
- Bundled per-model pricing table with user overrides; cost shown as an API-equivalent estimate.
- File watcher with debounce and interval fallback; configurable Claude data path.
