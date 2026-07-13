import * as assert from "assert";
import {
  bundledRate,
  currencyForRegion,
  resolveCurrency,
} from "../data/currency";

describe("currencyForRegion", () => {
  it("maps the Philippines to PHP", () => {
    assert.strictEqual(currencyForRegion("PH"), "PHP");
    assert.strictEqual(currencyForRegion("ph"), "PHP");
  });

  it("maps the US to USD", () => {
    assert.strictEqual(currencyForRegion("US"), "USD");
  });

  it("maps eurozone regions to EUR", () => {
    assert.strictEqual(currencyForRegion("DE"), "EUR");
    assert.strictEqual(currencyForRegion("FR"), "EUR");
  });

  it("falls back to USD for unknown / missing regions", () => {
    assert.strictEqual(currencyForRegion("ZZ"), "USD");
    assert.strictEqual(currencyForRegion(undefined), "USD");
  });
});

describe("resolveCurrency", () => {
  it("uses an explicit code with the bundled rate when rate is 0", () => {
    const r = resolveCurrency("PHP", 0);
    assert.strictEqual(r.code, "PHP");
    assert.strictEqual(r.rate, bundledRate("PHP"));
    assert.strictEqual(r.rateIsApproximate, true);
  });

  it("honours an explicit rate over the bundled one", () => {
    const r = resolveCurrency("PHP", 58.5);
    assert.strictEqual(r.rate, 58.5);
    assert.strictEqual(r.rateIsApproximate, false);
  });

  it("treats USD rate 1 as exact, not approximate", () => {
    const r = resolveCurrency("USD", 0);
    assert.strictEqual(r.code, "USD");
    assert.strictEqual(r.rate, 1);
    assert.strictEqual(r.rateIsApproximate, false);
  });

  it("auto-detects a valid currency and positive rate", () => {
    const r = resolveCurrency("auto", 0);
    assert.ok(/^[A-Z]{3}$/.test(r.code), `expected ISO code, got ${r.code}`);
    assert.ok(r.rate > 0);
  });
});
