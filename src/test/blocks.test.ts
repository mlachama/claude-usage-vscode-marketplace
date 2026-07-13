import * as assert from "assert";
import { activeWindowStatus, computeBlocks } from "../data/blocks";
import { UsageEntry } from "../data/types";

/** Minimal entry carrying just what block logic reads. */
function entry(timestamp: string, totalTokens: number): UsageEntry {
  return {
    messageId: timestamp,
    requestId: timestamp,
    dedupKey: timestamp,
    timestamp,
    date: timestamp.slice(0, 10),
    month: timestamp.slice(0, 7),
    sessionId: "s",
    projectKey: "p",
    projectPath: "p",
    projectLabel: "p",
    cwd: "p",
    model: "m",
    isSubagent: false,
    inputTokens: totalTokens,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens,
    webSearchRequests: 0,
    webFetchRequests: 0,
    costUSD: 0,
    costIsEstimate: true,
  };
}

describe("computeBlocks", () => {
  it("groups entries inside one 5-hour window into a single block", () => {
    const blocks = computeBlocks(
      [
        entry("2026-07-13T10:05:00.000Z", 100),
        entry("2026-07-13T12:30:00.000Z", 200),
        entry("2026-07-13T14:00:00.000Z", 300),
      ],
      5
    );
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].totalTokens, 600);
    // Start floored to the hour, reset 5h later.
    assert.strictEqual(blocks[0].startTime, "2026-07-13T10:00:00.000Z");
    assert.strictEqual(blocks[0].resetTime, "2026-07-13T15:00:00.000Z");
  });

  it("starts a new block after an idle gap longer than the window", () => {
    const blocks = computeBlocks(
      [
        entry("2026-07-13T09:00:00.000Z", 100),
        entry("2026-07-13T20:00:00.000Z", 100), // 11h later
      ],
      5
    );
    assert.strictEqual(blocks.length, 2);
  });

  it("starts a new block once the window length is exceeded from its start", () => {
    const blocks = computeBlocks(
      [
        entry("2026-07-13T10:00:00.000Z", 100),
        entry("2026-07-13T13:00:00.000Z", 100), // same window
        entry("2026-07-13T15:30:00.000Z", 100), // > 5h after 10:00 start
      ],
      5
    );
    assert.strictEqual(blocks.length, 2);
    assert.strictEqual(blocks[0].totalTokens, 200);
    assert.strictEqual(blocks[1].totalTokens, 100);
  });

  it("ignores entries with unparseable timestamps", () => {
    const blocks = computeBlocks([entry("not-a-date", 100)], 5);
    assert.strictEqual(blocks.length, 0);
  });
});

describe("activeWindowStatus", () => {
  const blocks = computeBlocks(
    [
      entry("2026-07-13T10:00:00.000Z", 1000), // older block, peak
      entry("2026-07-13T18:00:00.000Z", 250), // active block
    ],
    5
  );
  // 18:00 block resets at 23:00; pick "now" inside it.
  const now = Date.parse("2026-07-13T20:45:00.000Z");

  it("returns undefined when now is outside every window", () => {
    const idle = Date.parse("2026-07-14T09:00:00.000Z");
    assert.strictEqual(activeWindowStatus(blocks, { tokenLimit: 0 }, idle), undefined);
  });

  it("auto-estimates the cap from the historical peak", () => {
    const s = activeWindowStatus(blocks, { tokenLimit: 0 }, now);
    assert.ok(s);
    assert.strictEqual(s!.estimatedLimit, 1000); // peak block total
    assert.strictEqual(s!.tokensUsed, 250);
    assert.strictEqual(s!.percentLeft, 75); // 1 - 250/1000
    assert.strictEqual(s!.limitIsAuto, true);
  });

  it("honours a manual token limit", () => {
    const s = activeWindowStatus(blocks, { tokenLimit: 500 }, now);
    assert.strictEqual(s!.estimatedLimit, 500);
    assert.strictEqual(s!.percentLeft, 50); // 1 - 250/500
    assert.strictEqual(s!.limitIsAuto, false);
  });

  it("clamps percentLeft to 0 when over the estimated cap", () => {
    const s = activeWindowStatus(blocks, { tokenLimit: 100 }, now);
    assert.strictEqual(s!.percentLeft, 0);
  });

  it("computes a non-negative time remaining until reset", () => {
    const s = activeWindowStatus(blocks, { tokenLimit: 0 }, now);
    // 23:00 - 20:45 = 2h15m = 8_100_000 ms
    assert.strictEqual(s!.msRemaining, 8_100_000);
  });
});
