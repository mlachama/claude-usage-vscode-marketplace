import { ExtensionConfig } from "./config";

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

/** Format a USD amount into the configured display currency. */
export function formatCost(usd: number, config: ExtensionConfig): string {
  const value = usd * config.currencyRate;
  const symbol = currencySymbol(config.currency);
  const digits = value >= 100 ? 0 : value >= 1 ? 2 : 3;
  return `${symbol}${value.toFixed(digits)}`;
}

function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "JPY":
      return "¥";
    default:
      return `${currency} `;
  }
}
