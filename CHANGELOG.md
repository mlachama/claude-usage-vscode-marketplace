# Change Log

All notable changes to the "claude-usage" extension are documented here.

## [0.0.1] - Unreleased

- Initial version.
- Status bar item showing today's estimated cost / tokens with a tooltip breakdown.
- Dashboard webview with summary cards, daily-usage chart, and model/project breakdowns.
- Projects tree view (project → session → metrics).
- Streaming JSONL parser with `messageId:requestId` deduplication and incremental (tail) re-reads.
- Bundled per-model pricing table with user overrides; cost shown as an API-equivalent estimate.
- File watcher with debounce and interval fallback; configurable Claude data path.
