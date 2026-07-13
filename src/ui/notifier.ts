import * as vscode from "vscode";
import { ExtensionConfig } from "../config";
import { AggregationResult } from "../data/types";
import { evaluateNotifications, PendingNotification } from "../data/notify";
import { formatDisplayMoney, monthKey, todayKey } from "../format";

const PREFIX = "notified:";

/**
 * Shows budget / spend notifications derived by `evaluateNotifications`. Fired
 * keys are recorded in `globalState` so a given alert appears at most once per
 * period — the store re-scans often, and this must not nag on every change or
 * every window reload. Old keys are pruned so the state does not grow forever.
 */
export class Notifier {
  constructor(private readonly memento: vscode.Memento) {}

  check(result: AggregationResult | undefined, config: ExtensionConfig): void {
    if (!result) {
      return;
    }
    const pending = evaluateNotifications({
      result,
      todayKey: todayKey(),
      monthKey: monthKey(),
      enabled: config.notificationsEnabled,
      showCost: config.showCost,
      monthlyBudget: config.monthlyBudget,
      budgetWarnAtPercent: config.budgetWarnAtPercent,
      dailyCostThreshold: config.dailyCostThreshold,
      currencyRate: config.currencyRate,
      formatMoney: (v) => formatDisplayMoney(v, config),
    });
    this.prune();
    for (const n of pending) {
      this.maybeFire(n);
    }
  }

  private maybeFire(n: PendingNotification): void {
    const stateKey = PREFIX + n.key;
    if (this.memento.get<boolean>(stateKey)) {
      return; // already shown this period
    }
    void this.memento.update(stateKey, true);

    const items = ["Open dashboard", "Notification settings"];
    const shown =
      n.level === "warning"
        ? vscode.window.showWarningMessage(n.message, ...items)
        : vscode.window.showInformationMessage(n.message, ...items);
    void shown.then((choice) => {
      if (choice === "Open dashboard") {
        void vscode.commands.executeCommand("claude-usage.openDashboard");
      } else if (choice === "Notification settings") {
        void vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "claude-usage.notifications"
        );
      }
    });
  }

  /** Drop fired keys from earlier days / months so state stays bounded. */
  private prune(): void {
    const keepDaily = `${PREFIX}daily:${todayKey()}`;
    const mk = monthKey();
    for (const key of this.memento.keys()) {
      if (!key.startsWith(PREFIX)) {
        continue;
      }
      const isDaily = key.startsWith(`${PREFIX}daily:`);
      const isMonthly = key.startsWith(`${PREFIX}budget-`);
      if (isDaily && key !== keepDaily) {
        void this.memento.update(key, undefined);
      } else if (isMonthly && !key.endsWith(mk)) {
        void this.memento.update(key, undefined);
      }
    }
  }
}
