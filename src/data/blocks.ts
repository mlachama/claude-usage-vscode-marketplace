import { UsageBlock, UsageEntry } from "./types";

const HOUR_MS = 60 * 60 * 1000;

/** Floor an epoch-ms timestamp down to the start of its hour. */
function floorToHour(ms: number): number {
  return ms - (ms % HOUR_MS);
}

/**
 * Reconstruct Anthropic's rolling usage windows ("session blocks") from message
 * timestamps. A block opens at the first entry's time (floored to the hour) and
 * spans `windowHours`; a new block starts when an entry falls more than
 * `windowHours` after the block start **or** more than `windowHours` after the
 * previous entry (an idle gap). This mirrors the widely-used ccusage model; the
 * real reset is server-side, so treat block boundaries as a close estimate.
 */
export function computeBlocks(
  entries: UsageEntry[],
  windowHours = 5
): UsageBlock[] {
  const windowMs = Math.max(1, windowHours) * HOUR_MS;

  const timed = entries
    .map((e) => ({ e, t: Date.parse(e.timestamp) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  const blocks: UsageBlock[] = [];
  let current: UsageBlock | undefined;
  let startMs = 0;
  let lastMs = 0;

  for (const { e, t } of timed) {
    const startNew =
      !current || t - startMs >= windowMs || t - lastMs >= windowMs;

    if (startNew) {
      startMs = floorToHour(t);
      current = {
        startTime: new Date(startMs).toISOString(),
        resetTime: new Date(startMs + windowMs).toISOString(),
        lastEntryTime: e.timestamp,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        costUSD: 0,
        messageCount: 0,
      };
      blocks.push(current);
    }

    current!.inputTokens += e.inputTokens;
    current!.outputTokens += e.outputTokens;
    current!.cacheCreationTokens += e.cacheCreationTokens;
    current!.cacheReadTokens += e.cacheReadTokens;
    current!.totalTokens += e.totalTokens;
    current!.costUSD += e.costUSD;
    current!.messageCount += 1;
    current!.lastEntryTime = e.timestamp;
    lastMs = t;
  }

  return blocks;
}

export interface WindowStatusOptions {
  /** User-set token cap per window; 0 → auto-estimate from history. */
  tokenLimit: number;
}

export interface ActiveWindow {
  /** ISO8601 reset time of the active window. */
  resetTime: string;
  /** Milliseconds until reset (>= 0). */
  msRemaining: number;
  tokensUsed: number;
  /** Estimated token cap for the window (0 if not yet knowable). */
  estimatedLimit: number;
  /** Quota remaining as a percent (undefined when the limit is unknown). */
  percentLeft: number | undefined;
  /** True when the limit was auto-estimated rather than user-set. */
  limitIsAuto: boolean;
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/**
 * Status of the window that contains `now`, or `undefined` when idle (no
 * activity in the current window → the quota is effectively fresh). The limit
 * is the user's `tokenLimit` if set, else the peak total of any historical
 * block (a hands-off calibration that rises as usage grows).
 */
export function activeWindowStatus(
  blocks: UsageBlock[],
  opts: WindowStatusOptions,
  now: number = Date.now()
): ActiveWindow | undefined {
  const active = blocks.find((b) => {
    const start = Date.parse(b.startTime);
    const reset = Date.parse(b.resetTime);
    return now >= start && now < reset;
  });
  if (!active) {
    return undefined;
  }

  const limitIsAuto = !(opts.tokenLimit > 0);
  const estimatedLimit = limitIsAuto
    ? blocks.reduce((m, b) => Math.max(m, b.totalTokens), 0)
    : opts.tokenLimit;

  const percentLeft =
    estimatedLimit > 0
      ? clampPct(100 * (1 - active.totalTokens / estimatedLimit))
      : undefined;

  return {
    resetTime: active.resetTime,
    msRemaining: Math.max(0, Date.parse(active.resetTime) - now),
    tokensUsed: active.totalTokens,
    estimatedLimit,
    percentLeft,
    limitIsAuto,
  };
}
