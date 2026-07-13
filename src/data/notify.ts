import { AggregationResult } from "./types";

export type NotifyLevel = "info" | "warning";

/** A notification the UI should show, unless its `key` was already fired. */
export interface PendingNotification {
  /** Stable id for de-duplication (one per month / per day / per threshold). */
  key: string;
  level: NotifyLevel;
  message: string;
}

export interface NotifyInputs {
  result: AggregationResult;
  /** YYYY-MM-DD for "today" and YYYY-MM for "this month" (caller supplies). */
  todayKey: string;
  monthKey: string;

  enabled: boolean;
  showCost: boolean;
  /** Monthly budget in the display currency (0 disables). */
  monthlyBudget: number;
  /** Warn once at this % of budget before it is exceeded (0 disables). */
  budgetWarnAtPercent: number;
  /** Daily spend cap in the display currency (0 disables). */
  dailyCostThreshold: number;
  /** USD → display-currency multiplier. */
  currencyRate: number;
  /** Formats a value already in the display currency. */
  formatMoney: (displayValue: number) => string;
}

/**
 * Decide which budget / spend notifications are warranted for the current
 * totals. Pure and deterministic — the UI layer handles de-duplication (via a
 * persisted set of fired `key`s) and actually showing them. Returns at most one
 * budget notification and one daily notification.
 */
export function evaluateNotifications(a: NotifyInputs): PendingNotification[] {
  const out: PendingNotification[] = [];
  if (!a.enabled || !a.showCost) {
    return out;
  }

  if (a.monthlyBudget > 0) {
    const month = a.result.byMonth.find((r) => r.key === a.monthKey);
    if (month) {
      const spent = month.costUSD * a.currencyRate;
      const pct = (spent / a.monthlyBudget) * 100;
      const spentLabel = a.formatMoney(spent);
      const budgetLabel = a.formatMoney(a.monthlyBudget);
      if (pct >= 100) {
        out.push({
          key: `budget-exceeded:${a.monthKey}`,
          level: "warning",
          message: `Claude Code has passed your monthly budget — ${spentLabel} of ${budgetLabel} used (estimated).`,
        });
      } else if (a.budgetWarnAtPercent > 0 && pct >= a.budgetWarnAtPercent) {
        out.push({
          key: `budget-warn:${a.monthKey}`,
          level: "info",
          message: `Claude Code has used ${Math.round(
            pct
          )}% of your monthly budget — ${spentLabel} of ${budgetLabel} (estimated).`,
        });
      }
    }
  }

  if (a.dailyCostThreshold > 0) {
    const today = a.result.byDay.find((r) => r.key === a.todayKey);
    if (today) {
      const spent = today.costUSD * a.currencyRate;
      if (spent >= a.dailyCostThreshold) {
        out.push({
          key: `daily:${a.todayKey}`,
          level: "info",
          message: `Today's Claude Code usage passed ${a.formatMoney(
            a.dailyCostThreshold
          )} — now ${a.formatMoney(spent)} (estimated).`,
        });
      }
    }
  }

  return out;
}
