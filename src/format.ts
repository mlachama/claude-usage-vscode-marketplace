import { ExtensionConfig } from "./config";

/** Local-time YYYY-MM-DD key for a date (default: now). */
export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Local-time YYYY-MM key for a date (default: now). */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Duration in ms → "H:MM" (e.g. 4h15m → "4:15"); negatives clamp to "0:00". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/** Compact token count, e.g. 1234567 → "1.23M". */
export function formatTokens(n: number): string {
  if (n < 1000) {
    return String(n);
  }
  if (n < 1_000_000) {
    return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  }
  if (n < 1_000_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

/**
 * Format a USD amount into the configured display currency. Uses the platform
 * Intl currency formatter, so any ISO 4217 code (PHP → ₱, EUR → €, …) gets the
 * right symbol and locale-correct thousands grouping — important for
 * high-magnitude currencies like the peso where a day can read ₱1,120 rather
 * than an unreadable ₱1120. Everything here is offline; no network is touched.
 * A non-ISO label falls back to a plain "<CODE> <number>" form.
 */
export function formatCost(usd: number, config: ExtensionConfig): string {
  return formatDisplayMoney(usd * config.currencyRate, config);
}

/**
 * Format a value that is *already* in the display currency (e.g. a budget or
 * threshold the user typed in pesos). Shares the symbol + grouping logic with
 * formatCost, which just converts from USD first.
 */
export function formatDisplayMoney(
  value: number,
  config: Pick<ExtensionConfig, "currency">
): string {
  const abs = Math.abs(value);
  // Keep more precision for sub-unit amounts; drop cents on large sums.
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
  const code = config.currency.trim().toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    // Not a valid currency code — show the label and a grouped number.
    return `${code} ${value.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  }
}
