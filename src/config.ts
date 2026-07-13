import * as vscode from "vscode";
import { resolveClaudeDir, resolveProjectsDir } from "./data/paths";
import { CostOptions, PricingOverrides } from "./data/types";

export type StatusMetric = "todayCost" | "todayTokens" | "monthCost" | "hide";

export interface ExtensionConfig {
  refreshInterval: number;
  showCost: boolean;
  currency: string;
  currencyRate: number;
  statusBarEnabled: boolean;
  statusMetric: StatusMetric;
  claudeDir: string;
  projectsDir: string;
  daysToShow: number;
  monthlyBudget: number;
  costOptions: CostOptions;
}

const SECTION = "claude-usage";

export function readConfig(): ExtensionConfig {
  const c = vscode.workspace.getConfiguration(SECTION);
  const claudeDir = resolveClaudeDir(c.get<string>("claudePath", ""));
  const overrides = c.get<PricingOverrides>("pricingOverrides", {});
  return {
    refreshInterval: c.get<number>("refreshInterval", 60),
    showCost: c.get<boolean>("showCost", true),
    currency: c.get<string>("currency", "USD"),
    currencyRate: c.get<number>("currencyRate", 1),
    statusBarEnabled: c.get<boolean>("statusBar.enabled", true),
    statusMetric: c.get<StatusMetric>("statusBar.metric", "todayCost"),
    claudeDir,
    projectsDir: resolveProjectsDir(claudeDir),
    daysToShow: c.get<number>("daysToShow", 14),
    monthlyBudget: c.get<number>("budget.monthly", 0),
    costOptions: {
      cacheWriteTtl: "5m",
      overrides,
    },
  };
}

export function affectsUs(e: vscode.ConfigurationChangeEvent): boolean {
  return e.affectsConfiguration(SECTION);
}
