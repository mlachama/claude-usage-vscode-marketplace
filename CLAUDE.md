# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A VS Code extension ("Claude Usage") that reads Claude Code's **local** session
logs and displays token usage plus an estimated (API-equivalent) cost via a
status bar item, a webview dashboard, and a projects tree view. Nothing is sent
over the network.

## Commands

- `npm install` — install dependencies.
- `npm run compile` / `npm run watch` — esbuild bundle to `dist/extension.js` (watch for F5 dev).
- `npm run compile-tests` — `tsc` typecheck + emit tests to `out/`.
- `npm run lint` — eslint over `src`.
- `npm test` — full integration tests via `@vscode/test-cli` (downloads a VS Code build; needs network).
- **Run a single/unit test without the VS Code host:** the data-layer tests import nothing from `vscode`, so run them directly: `npx mocha "out/test/**/*.test.js"` (optionally `--grep "<name>"`) after `npm run compile-tests`.
- `npx vsce package --allow-missing-repository` — produce a `.vsix` (placeholder `publisher` in package.json must be replaced before publishing).
- Press **F5** in VS Code to launch the Extension Development Host.

## Architecture

Data flows one direction: **files → store → aggregation → UI**.

- `src/data/` is pure Node (no `vscode` import), which is why it is unit-testable directly:
  - `parser.ts` streams a JSONL file from a byte offset, guarded per-line; only `type:"assistant"` lines with a `message.usage` block become entries. Project path is resolved from the first `cwd` in the file (the sanitized dir name is **not** reliably invertible).
  - `dedup.ts` collapses duplicates on `messageId:requestId` across the whole scan.
  - `pricing.ts` holds the bundled per-model rate table + override merge + `costForEntry`. Model lookup tolerates an `anthropic/` prefix and a trailing `-YYYYMMDD` snapshot suffix.
  - `aggregate.ts` reduces entries into day/month/session/project/model rollups (+ a project→session tree), each with a nested per-model breakdown. It also calls `blocks.ts` to attach `blocks` (see below); pass `windowHours` as the 2nd arg.
  - `blocks.ts` reconstructs Anthropic's rolling ~5-hour usage windows from message timestamps (ccusage-style grouping). `activeWindowStatus` reports time-to-reset + estimated `% left` for the window containing "now"; the quota cap is the user's `resetWindow.tokenLimit` or, when 0, the peak of any historical block (auto-calibration). The `%` is inherently an estimate — the real plan limit isn't stored locally. Feeds both the `resetTimer` status-bar metric (`Claude 4:15 - 23%`, showing % **left**) and the dashboard's "Usage limits" card, which mirrors Claude Code's native usage panel (Current session · "Resets in Xhr Ymin" · bar · "N% **used**") — session only, since weekly/server limits aren't in the local logs. Both count down live: the status bar via a 30s `setInterval`, the dashboard webview via its own 1s tick in `media/dashboard.js` (the extension passes the absolute `resetTime` so the countdown runs client-side).
  - `currency.ts` resolves the display currency + rate offline: `currency:"auto"` maps the OS region (via `Intl.Locale`) to an ISO code, and `currencyRate:0` uses a bundled **approximate** USD→currency table (labeled, user-overridable — same fallback philosophy as `BUNDLED_PRICING`). `formatCost` in `src/format.ts` then renders it with `Intl.NumberFormat` (`narrowSymbol`) for the correct symbol + grouping.
- `src/store.ts` (`UsageStore`) owns a per-file cache keyed by `{mtimeMs,size,offset}` and re-parses only the appended tail of changed files, then re-aggregates. Fires `onDidChange`.
- `src/watcher.ts` uses **chokidar** (not `workspace.createFileSystemWatcher`, which can't see `~/.claude` outside the workspace) with debounce + an interval fallback.
- `src/ui/` renders: `statusBar.ts`, `dashboardView.ts` (webview view; strict nonce CSP; extension owns data, `media/dashboard.{css,js}` is a dumb renderer with hand-rolled div bars — no CDN), `treeView.ts`, and `notifier.ts`.
  - Notifications: pure logic in `src/data/notify.ts` (`evaluateNotifications` decides which budget/daily alerts are warranted — unit-testable, no `vscode`); `src/ui/notifier.ts` shows them and records fired keys in `context.globalState` so each alert fires at most once per period (pruned to keep state bounded). Thresholds compare `costUSD * currencyRate` against budgets expressed in the display currency, mirroring the status-bar amber logic.
- `src/extension.ts` wires it all together. On `claude-usage.*` config changes it re-renders in place, except: changing `claudePath` or `pricingOverrides` calls `store.reset()` + a full rescan (cached entries carry a computed `costUSD`, so pricing changes require re-parsing, not just re-aggregating), and changing `refreshInterval` restarts the watcher.

## Notes

- Cost is always an **estimate** and labeled as such — subscription (Max/Pro) sessions are not billed per token. Token counts are exact.
- When Claude model ids or prices change, update `BUNDLED_PRICING` in `src/data/pricing.ts`; users can also override via the `claude-usage.pricingOverrides` setting.
