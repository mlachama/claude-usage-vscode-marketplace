import * as assert from "assert";
import { ExtensionConfig } from "../config";
import { formatCost, formatDuration, formatTokens } from "../format";

/** Minimal config for the fields formatCost/formatTokens read. */
function cfg(over: Partial<ExtensionConfig> = {}): ExtensionConfig {
  return {
    currency: "USD",
    currencyRate: 1,
    ...over,
  } as ExtensionConfig;
}

describe("formatTokens", () => {
  it("scales into K/M/B", () => {
    assert.strictEqual(formatTokens(999), "999");
    assert.strictEqual(formatTokens(1500), "1.5K");
    assert.strictEqual(formatTokens(1_234_567), "1.23M");
  });
});

describe("formatDuration", () => {
  it("formats hours and zero-padded minutes", () => {
    assert.strictEqual(formatDuration(4 * 3600_000 + 15 * 60_000), "4:15");
    assert.strictEqual(formatDuration(7 * 60_000), "0:07");
    assert.strictEqual(formatDuration(0), "0:00");
  });

  it("clamps negatives to 0:00", () => {
    assert.strictEqual(formatDuration(-5000), "0:00");
  });
});

describe("formatCost", () => {
  it("uses $ for USD with cents on small amounts", () => {
    assert.strictEqual(formatCost(2.5, cfg()), "$2.50");
  });

  it("drops cents on large amounts", () => {
    // 150 → >= 100 → 0 fraction digits.
    assert.strictEqual(formatCost(150, cfg()), "$150");
  });

  it("renders PHP with the ₱ symbol, rate, and thousands grouping", () => {
    // $20 × 56 = ₱1,120 → >= 100 → grouped, no cents.
    const out = formatCost(20, cfg({ currency: "PHP", currencyRate: 56 }));
    assert.ok(out.includes("₱"), `expected peso sign in ${out}`);
    assert.ok(out.includes("1,120"), `expected grouping in ${out}`);
  });

  it("keeps extra precision for sub-unit amounts", () => {
    // $0.05 × 56 = ₱2.80 → >= 1 → 2 digits.
    assert.strictEqual(
      formatCost(0.05, cfg({ currency: "PHP", currencyRate: 56 })),
      "₱2.80"
    );
  });

  it("falls back gracefully for a non-ISO label", () => {
    const out = formatCost(5, cfg({ currency: "credits" }));
    assert.ok(out.startsWith("CREDITS "), `expected labelled fallback, got ${out}`);
  });
});
