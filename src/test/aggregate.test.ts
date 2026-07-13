import * as assert from "assert";
import { aggregate } from "../data/aggregate";
import { UsageEntry } from "../data/types";

function entry(over: Partial<UsageEntry>): UsageEntry {
  const base: UsageEntry = {
    messageId: "m",
    requestId: "r",
    dedupKey: "m:r",
    timestamp: "2026-07-08T10:00:00.000Z",
    date: "2026-07-08",
    month: "2026-07",
    sessionId: "sess-1",
    projectKey: "proj-a",
    projectPath: "/proj/a",
    projectLabel: "a",
    cwd: "/proj/a",
    model: "claude-sonnet-4-6",
    isSubagent: false,
    inputTokens: 10,
    outputTokens: 20,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 30,
    webSearchRequests: 0,
    webFetchRequests: 0,
    costUSD: 1,
    costIsEstimate: true,
  };
  return { ...base, ...over, dedupKey: `${over.messageId ?? "m"}:${over.requestId ?? "r"}` };
}

describe("aggregate", () => {
  it("dedupes on messageId:requestId", () => {
    const dup = entry({ messageId: "m1", requestId: "r1" });
    const res = aggregate([dup, { ...dup }]);
    assert.strictEqual(res.grandTotal.messageCount, 1);
    assert.strictEqual(res.grandTotal.totalTokens, 30);
  });

  it("counts entries missing an id (cannot prove duplicate)", () => {
    const a = entry({ messageId: "", requestId: "" });
    const b = entry({ messageId: "", requestId: "" });
    const res = aggregate([a, b]);
    assert.strictEqual(res.grandTotal.messageCount, 2);
  });

  it("rolls up by day, month, project and model with nested breakdown", () => {
    const res = aggregate([
      entry({ messageId: "a", requestId: "1", model: "claude-opus-4-8", costUSD: 2 }),
      entry({ messageId: "b", requestId: "2", model: "claude-sonnet-4-6", costUSD: 1 }),
    ]);
    assert.strictEqual(res.byDay.length, 1);
    assert.strictEqual(res.byDay[0].key, "2026-07-08");
    assert.strictEqual(res.byMonth[0].key, "2026-07");
    assert.strictEqual(res.byModel.length, 2);
    // sorted by cost desc → opus first
    assert.strictEqual(res.byModel[0].key, "claude-opus-4-8");
    assert.strictEqual(res.grandTotal.costUSD, 3);
    assert.strictEqual(Object.keys(res.byDay[0].byModel).length, 2);
  });

  it("builds a project → session tree", () => {
    const res = aggregate([
      entry({ messageId: "a", requestId: "1", projectKey: "p1", sessionId: "s1" }),
      entry({ messageId: "b", requestId: "2", projectKey: "p1", sessionId: "s2" }),
      entry({ messageId: "c", requestId: "3", projectKey: "p2", sessionId: "s3" }),
    ]);
    assert.strictEqual(res.projectTree.length, 2);
    const p1 = res.projectTree.find((n) => n.project.key === "p1");
    assert.ok(p1);
    assert.strictEqual(p1.sessions.length, 2);
  });
});
