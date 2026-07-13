import * as vscode from "vscode";
import { resolveClaudeDir, resolveProjectsDir } from "./data/paths";
import { resolveCurrency } from "./data/currency";
import { CostOptions, PricingOverrides } from "./data/types";

export type StatusMetric =
  | "todayCost"
  | "todayTokens"
  | "monthCost"
  | "resetTimer"
  | "hide";

export interface ExtensionConfig {
  refreshInterval: number;
  showCost: boolean;
  currency: string;
  currencyRate: number;
  /** True when currencyRate came from the bundled approximate table. */
  rateIsApproximate: boolean;
  statusBarEnabled: boolean;
  statusMetric: StatusMetric;
  claudeDir: string;
  projectsDir: string;
  daysToShow: number;
  monthlyBudget: number;
  resetWindowHours: number;
  resetTokenLimit: number;
  notificationsEnabled: boolean;
  budgetWarnAtPercent: number;
  dailyCostThreshold: number;
  costOptions: CostOptions;
}

const SECTION = "claude-usage";

export function readConfig(): ExtensionConfig {
  const c = vscode.workspace.getConfiguration(SECTION);
  const claudeDir = resolveClaudeDir(c.get<string>("claudePath", ""));
  const overrides = c.get<PricingOverrides>("pricingOverrides", {});
  const currency = resolveCurrency(
    c.get<string>("currency", "auto"),
    c.get<number>("currencyRate", 0)
  );
  return {
    refreshInterval: c.get<number>("refreshInterval", 60),
    showCost: c.get<boolean>("showCost", true),
    currency: currency.code,
    currencyRate: currency.rate,
    rateIsApproximate: currency.rateIsApproximate,
    statusBarEnabled: c.get<boolean>("statusBar.enabled", true),
    statusMetric: c.get<StatusMetric>("statusBar.metric", "todayCost"),
    claudeDir,
    projectsDir: resolveProjectsDir(claudeDir),
    daysToShow: c.get<number>("daysToShow", 14),
    monthlyBudget: c.get<number>("budget.monthly", 0),
    resetWindowHours: c.get<number>("resetWindow.hours", 5),
    resetTokenLimit: c.get<number>("resetWindow.tokenLimit", 0),
    notificationsEnabled: c.get<boolean>("notifications.enabled", true),
    budgetWarnAtPercent: c.get<number>("notifications.budgetWarnAtPercent", 80),
    dailyCostThreshold: c.get<number>("notifications.dailyCostThreshold", 0),
    costOptions: {
      cacheWriteTtl: "5m",
      overrides,
    },
  };
}

export function affectsUs(e: vscode.ConfigurationChangeEvent): boolean {
  return e.affectsConfiguration(SECTION);
}
