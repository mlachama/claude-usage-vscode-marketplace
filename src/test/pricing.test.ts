import * as assert from "assert";
import { costForEntry, resolvePricing } from "../data/pricing";

describe("pricing", () => {
  it("computes cost for a known model and token vector", () => {
    // sonnet-4-6: $3/1M in, $15/1M out, cacheWrite5m=1.25x in, cacheRead=0.1x in
    const cost = costForEntry(
      {
        model: "claude-sonnet-4-6",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheCreationTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        webSearchRequests: 0,
        webFetchRequests: 0,
      },
      { cacheWriteTtl: "5m" }
    );
    // 3 + 15 + (3*1.25=3.75) + (3*0.1=0.30) = 22.05
    assert.ok(Math.abs(cost - 22.05) < 1e-6, `got ${cost}`);
  });

  it("returns zero cost for an unknown model", () => {
    const cost = costForEntry(
      {
        model: "some-unknown-model",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        webSearchRequests: 0,
        webFetchRequests: 0,
      },
      { cacheWriteTtl: "5m" }
    );
    assert.strictEqual(cost, 0);
  });

  it("applies user overrides (per 1M)", () => {
    const p = resolvePricing("claude-sonnet-4-6", {
      "claude-sonnet-4-6": { input: 999 },
    });
    assert.ok(Math.abs(p.input - 999 / 1_000_000) < 1e-12);
  });

  it("tolerates an anthropic/ prefix", () => {
    const p = resolvePricing("anthropic/claude-opus-4-8");
    assert.ok(p.output > 0);
  });

  it("matches a dated model snapshot (e.g. claude-haiku-4-5-20251001)", () => {
    const p = resolvePricing("claude-haiku-4-5-20251001");
    assert.ok(p.input > 0, "dated haiku id should resolve to non-zero pricing");
  });
});
