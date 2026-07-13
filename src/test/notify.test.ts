import * as assert from "assert";
import { evaluateNotifications, NotifyInputs } from "../data/notify";
import { AggregationResult, UsageRollup } from "../data/types";

function rollup(key: string, costUSD: number): UsageRollup {
  return {
    key,
    label: key,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUSD,
    costIsEstimate: true,
    messageCount: 1,
    firstSeen: "",
    lastSeen: "",
    byModel: {},
  };
}

/** Result with a single month rollup and a single day rollup. */
function result(monthUSD: number, dayUSD: number): AggregationResult {
  return {
    byDay: [rollup("2026-07-13", dayUSD)],
    byMonth: [rollup("2026-07", monthUSD)],
    bySession: [],
    byProject: [],
    byModel: [],
    projectTree: [],
    blocks: [],
    grandTotal: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      costUSD: monthUSD,
      costIsEstimate: true,
      messageCount: 1,
    },
  };
}

function inputs(over: Partial<NotifyInputs> = {}): NotifyInputs {
  return {
    result: result(0, 0),
    todayKey: "2026-07-13",
    monthKey: "2026-07",
    enabled: true,
    showCost: true,
    monthlyBudget: 0,
    budgetWarnAtPercent: 80,
    dailyCostThreshold: 0,
    currencyRate: 1,
    formatMoney: (v) => `$${v.toFixed(2)}`,
    ...over,
  };
}

describe("evaluateNotifications", () => {
  it("returns nothing when disabled", () => {
    const out = evaluateNotifications(
      inputs({ enabled: false, monthlyBudget: 10, result: result(50, 0) })
    );
    assert.strictEqual(out.length, 0);
  });

  it("returns nothing when cost display is off", () => {
    const out = evaluateNotifications(
      inputs({ showCost: false, monthlyBudget: 10, result: result(50, 0) })
    );
    assert.strictEqual(out.length, 0);
  });

  it("fires a warning when the monthly budget is exceeded", () => {
    const out = evaluateNotifications(
      inputs({ monthlyBudget: 10, result: result(12, 0) })
    );
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].level, "warning");
    assert.strictEqual(out[0].key, "budget-exceeded:2026-07");
  });

  it("fires an info alert when approaching the budget (>= warn %)", () => {
    const out = evaluateNotifications(
      inputs({ monthlyBudget: 10, budgetWarnAtPercent: 80, result: result(9, 0) })
    );
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].level, "info");
    assert.strictEqual(out[0].key, "budget-warn:2026-07");
  });

  it("stays quiet below the warn threshold", () => {
    const out = evaluateNotifications(
      inputs({ monthlyBudget: 10, budgetWarnAtPercent: 80, result: result(5, 0) })
    );
    assert.strictEqual(out.length, 0);
  });

  it("applies the currency rate to the budget comparison", () => {
    // $1 × 56 = ₱56, budget ₱50 → exceeded.
    const out = evaluateNotifications(
      inputs({ monthlyBudget: 50, currencyRate: 56, result: result(1, 0) })
    );
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].key, "budget-exceeded:2026-07");
  });

  it("fires a daily alert when today crosses the threshold", () => {
    const out = evaluateNotifications(
      inputs({ dailyCostThreshold: 5, result: result(0, 6) })
    );
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].key, "daily:2026-07-13");
  });

  it("can fire both a budget and a daily alert at once", () => {
    const out = evaluateNotifications(
      inputs({
        monthlyBudget: 10,
        dailyCostThreshold: 5,
        result: result(12, 6),
      })
    );
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(
      out.map((n) => n.key).sort(),
      ["budget-exceeded:2026-07", "daily:2026-07-13"]
    );
  });
});
