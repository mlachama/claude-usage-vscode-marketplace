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
  - `aggregate.ts` reduces entries into day/month/session/project/model rollups (+ a project→session tree), each with a nested per-model breakdown.
- `src/store.ts` (`UsageStore`) owns a per-file cache keyed by `{mtimeMs,size,offset}` and re-parses only the appended tail of changed files, then re-aggregates. Fires `onDidChange`.
- `src/watcher.ts` uses **chokidar** (not `workspace.createFileSystemWatcher`, which can't see `~/.claude` outside the workspace) with debounce + an interval fallback.
- `src/ui/` renders: `statusBar.ts`, `dashboardView.ts` (webview view; strict nonce CSP; extension owns data, `media/dashboard.{css,js}` is a dumb renderer with hand-rolled div bars — no CDN), `treeView.ts`.
- `src/extension.ts` wires it all and re-inits store/watcher on relevant `claude-usage.*` config changes.

## Notes

- Cost is always an **estimate** and labeled as such — subscription (Max/Pro) sessions are not billed per token. Token counts are exact.
- When Claude model ids or prices change, update `BUNDLED_PRICING` in `src/data/pricing.ts`; users can also override via the `claude-usage.pricingOverrides` setting.
