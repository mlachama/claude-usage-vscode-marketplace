import {
  CostOptions,
  ModelPricing,
  PricingOverrides,
  PricingTable,
  UsageEntry,
} from "./types";

const PER_MILLION = 1_000_000;

/**
 * Build per-token rates from $/1M input & output, applying Anthropic's standard
 * cache multipliers: write-5m = 1.25x input, write-1h = 2x input, read = 0.1x input.
 */
function rate(inputPerM: number, outputPerM: number): ModelPricing {
  const input = inputPerM / PER_MILLION;
  const output = outputPerM / PER_MILLION;
  return {
    input,
    output,
    cacheWrite5m: input * 1.25,
    cacheWrite1h: input * 2,
    cacheRead: input * 0.1,
    // Server tools are billed per request, not per token.
    webSearchPerRequest: 0.01,
    webFetchPerRequest: 0,
  };
}

/**
 * Bundled pricing snapshot (USD per 1M tokens), current as of 2026-07.
 * Values here are a maintained fallback; users can override via settings.
 * NOTE: Sonnet 5 carries an introductory rate ($2/$10) through 2026-08-31.
 */
export const BUNDLED_PRICING: PricingTable = {
  "claude-opus-4-8": rate(5, 25),
  "claude-opus-4-7": rate(5, 25),
  "claude-opus-4-6": rate(5, 25),
  "claude-sonnet-5": rate(3, 15),
  "claude-sonnet-4-6": rate(3, 15),
  "claude-sonnet-4-5": rate(3, 15),
  "claude-haiku-4-5": rate(1, 5),
  "claude-fable-5": rate(10, 50),
};

/** Zero-cost pricing used when a model id is unknown (tokens still counted). */
const UNKNOWN_PRICING: ModelPricing = {
  input: 0,
  output: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  cacheRead: 0,
  webSearchPerRequest: 0,
  webFetchPerRequest: 0,
};

function overrideToPricing(
  base: ModelPricing,
  ov: PricingOverrides[string]
): ModelPricing {
  const merged: ModelPricing = { ...base };
  if (ov.input !== undefined) {
    merged.input = ov.input / PER_MILLION;
  }
  if (ov.output !== undefined) {
    merged.output = ov.output / PER_MILLION;
  }
  if (ov.cacheWrite5m !== undefined) {
    merged.cacheWrite5m = ov.cacheWrite5m / PER_MILLION;
  }
  if (ov.cacheWrite1h !== undefined) {
    merged.cacheWrite1h = ov.cacheWrite1h / PER_MILLION;
  }
  if (ov.cacheRead !== undefined) {
    merged.cacheRead = ov.cacheRead / PER_MILLION;
  }
  if (ov.webSearchPerRequest !== undefined) {
    merged.webSearchPerRequest = ov.webSearchPerRequest;
  }
  if (ov.webFetchPerRequest !== undefined) {
    merged.webFetchPerRequest = ov.webFetchPerRequest;
  }
  return merged;
}

/**
 * Resolve the pricing for a model id: bundled table (with normalization) merged
 * with any user override. Unknown models resolve to zero cost.
 */
export function resolvePricing(
  model: string,
  overrides?: PricingOverrides
): ModelPricing {
  const base = lookupBundled(model) ?? UNKNOWN_PRICING;
  const ov = overrides?.[model];
  return ov ? overrideToPricing(base, ov) : base;
}

/**
 * Match against the bundled table, tolerating an `anthropic/` prefix and a
 * trailing date snapshot suffix (e.g. `claude-haiku-4-5-20251001`).
 */
function lookupBundled(model: string): ModelPricing | undefined {
  if (BUNDLED_PRICING[model]) {
    return BUNDLED_PRICING[model];
  }
  const stripped = model.replace(/^anthropic\//, "");
  if (BUNDLED_PRICING[stripped]) {
    return BUNDLED_PRICING[stripped];
  }
  // Drop a trailing "-YYYYMMDD" snapshot suffix and retry.
  const undated = stripped.replace(/-\d{8}$/, "");
  return BUNDLED_PRICING[undated];
}

/**
 * Cost of a single usage entry (before it is summed into a rollup).
 * The cache-write rate follows options.cacheWriteTtl (the JSONL has no TTL).
 */
export function costForEntry(
  entry: Pick<
    UsageEntry,
    | "model"
    | "inputTokens"
    | "outputTokens"
    | "cacheCreationTokens"
    | "cacheReadTokens"
    | "webSearchRequests"
    | "webFetchRequests"
  >,
  options: CostOptions
): number {
  const p = resolvePricing(entry.model, options.overrides);
  const cacheWriteRate =
    options.cacheWriteTtl === "1h" ? p.cacheWrite1h : p.cacheWrite5m;
  return (
    entry.inputTokens * p.input +
    entry.outputTokens * p.output +
    entry.cacheCreationTokens * cacheWriteRate +
    entry.cacheReadTokens * p.cacheRead +
    entry.webSearchRequests * (p.webSearchPerRequest ?? 0) +
    entry.webFetchRequests * (p.webFetchPerRequest ?? 0)
  );
}
