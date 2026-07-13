/**
 * Offline currency resolution. Picks a display currency from the user's system
 * region (Philippines → PHP, US → USD, …) and supplies an *approximate* USD→
 * currency rate so amounts read in local money out of the box. No network is
 * ever touched — the rate table is a maintained fallback, exactly like the
 * bundled pricing table, and users can override it with `currencyRate`.
 */

/** Bundled approximate USD→currency rates. Update periodically; users override. */
export const APPROX_RATE_AS_OF = "2026-07";

const APPROX_RATE_PER_USD: Record<string, number> = {
  USD: 1,
  PHP: 56,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 157,
  CNY: 7.2,
  HKD: 7.8,
  TWD: 32,
  KRW: 1350,
  INR: 83,
  IDR: 16000,
  MYR: 4.7,
  THB: 36,
  VND: 25000,
  SGD: 1.35,
  AUD: 1.5,
  NZD: 1.65,
  CAD: 1.36,
  MXN: 18,
  BRL: 5.4,
  CHF: 0.9,
  SEK: 10.5,
  NOK: 10.7,
  DKK: 6.9,
  PLN: 4,
  CZK: 23,
  HUF: 360,
  RON: 4.6,
  RUB: 90,
  TRY: 32,
  ZAR: 18.5,
  AED: 3.67,
  SAR: 3.75,
  ILS: 3.7,
  EGP: 48,
  NGN: 1500,
};

const EURO_REGIONS = [
  "AT", "BE", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
];

/** Region (ISO 3166-1 alpha-2) → currency code. Falls back to USD. */
const REGION_CURRENCY: Record<string, string> = {
  US: "USD",
  PH: "PHP",
  GB: "GBP",
  JP: "JPY",
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  KR: "KRW",
  IN: "INR",
  ID: "IDR",
  MY: "MYR",
  TH: "THB",
  VN: "VND",
  SG: "SGD",
  AU: "AUD",
  NZ: "NZD",
  CA: "CAD",
  MX: "MXN",
  BR: "BRL",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  RU: "RUB",
  TR: "TRY",
  ZA: "ZAR",
  AE: "AED",
  SA: "SAR",
  IL: "ILS",
  EG: "EGP",
  NG: "NGN",
  ...Object.fromEntries(EURO_REGIONS.map((r) => [r, "EUR"])),
};

export interface ResolvedCurrency {
  /** ISO 4217 code to display in. */
  code: string;
  /** Multiplier applied to USD amounts. */
  rate: number;
  /** True when `rate` came from the bundled table rather than the user. */
  rateIsApproximate: boolean;
}

/** Currency for a region code, or USD when the region is unknown. */
export function currencyForRegion(region: string | undefined): string {
  if (!region) {
    return "USD";
  }
  return REGION_CURRENCY[region.toUpperCase()] ?? "USD";
}

/** Bundled approximate rate for a currency, if one is known. */
export function bundledRate(code: string): number | undefined {
  return APPROX_RATE_PER_USD[code.toUpperCase()];
}

/**
 * Best-effort, offline detection of the user's region from the OS locale.
 * Prefers an explicit region subtag (e.g. `en-PH` → PH); otherwise lets ICU
 * guess a likely region for a bare language (e.g. `fil` → PH).
 */
export function detectRegion(): string | undefined {
  const candidates: string[] = [];
  // Unix exposes monetary/locale hints in the environment.
  const env =
    process.env.LC_ALL || process.env.LC_MONETARY || process.env.LANG;
  if (env) {
    candidates.push(env.split(".")[0].replace("_", "-"));
  }
  try {
    candidates.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Intl unavailable — nothing to add.
  }
  for (const tag of candidates) {
    try {
      const loc = new Intl.Locale(tag);
      const region = loc.region ?? loc.maximize().region;
      if (region) {
        return region.toUpperCase();
      }
    } catch {
      // Malformed tag — try the next candidate.
    }
  }
  return undefined;
}

/**
 * Resolve the effective display currency and rate from the two settings.
 * `currencySetting` may be an ISO code or `"auto"`/empty to detect from region.
 * `rateSetting` of `0` (or negative) means "use the bundled approximate rate".
 */
export function resolveCurrency(
  currencySetting: string,
  rateSetting: number
): ResolvedCurrency {
  const raw = (currencySetting ?? "").trim();
  const code =
    raw === "" || raw.toLowerCase() === "auto"
      ? currencyForRegion(detectRegion())
      : raw.toUpperCase();

  if (Number.isFinite(rateSetting) && rateSetting > 0) {
    return { code, rate: rateSetting, rateIsApproximate: false };
  }
  const approx = bundledRate(code);
  return {
    code,
    rate: approx ?? 1,
    // A rate of exactly 1 for USD is not really an estimate.
    rateIsApproximate: approx !== undefined && code !== "USD",
  };
}
