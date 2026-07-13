/** Raw token counts shared by entries and rollups. */
export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

/** One deduplicated assistant message that carried a usage block. */
export interface UsageEntry extends TokenTotals {
  // identity / dedup
  messageId: string;
  requestId: string;
  dedupKey: string;

  // dimensions
  timestamp: string; // ISO8601, verbatim from the line
  date: string; // derived YYYY-MM-DD (local tz)
  month: string; // derived YYYY-MM
  sessionId: string;
  projectKey: string; // sanitized dir name
  projectPath: string; // resolved from cwd (exact) or de-sanitized (approx)
  projectLabel: string; // basename of projectPath
  cwd: string;
  model: string;
  isSubagent: boolean;

  // server tools (per-request billing)
  webSearchRequests: number;
  webFetchRequests: number;

  // cost
  costUSD: number;
  costIsEstimate: boolean;
}

/** Per-model slice nested inside a rollup. */
export interface ModelBreakdown extends TokenTotals {
  model: string;
  costUSD: number;
  messageCount: number;
}

/** Generic rollup keyed by day / month / session / project / model. */
export interface UsageRollup extends TokenTotals {
  key: string;
  label: string; // human label (e.g. project basename, session short id)
  costUSD: number;
  costIsEstimate: boolean;
  messageCount: number;
  firstSeen: string; // ISO8601
  lastSeen: string; // ISO8601
  byModel: Record<string, ModelBreakdown>;
}

export interface GrandTotal extends TokenTotals {
  costUSD: number;
  costIsEstimate: boolean;
  messageCount: number;
}

/** A project with its per-session breakdown, for the tree view. */
export interface ProjectNode {
  project: UsageRollup;
  sessions: UsageRollup[];
}

export interface AggregationResult {
  byDay: UsageRollup[];
  byMonth: UsageRollup[];
  bySession: UsageRollup[];
  byProject: UsageRollup[];
  byModel: UsageRollup[];
  projectTree: ProjectNode[];
  grandTotal: GrandTotal;
}

/** Per-token rates (USD per single token; already divided from $/1M). */
export interface ModelPricing {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  webSearchPerRequest?: number;
  webFetchPerRequest?: number;
}

export type PricingTable = Record<string, ModelPricing>;

/** Pricing override as authored by the user, expressed in USD per 1M tokens. */
export interface PricingOverridePerMillion {
  input?: number;
  output?: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  cacheRead?: number;
  webSearchPerRequest?: number;
  webFetchPerRequest?: number;
}

export type PricingOverrides = Record<string, PricingOverridePerMillion>;

export interface CostOptions {
  cacheWriteTtl: "5m" | "1h";
  overrides?: PricingOverrides;
}

export function emptyTokenTotals(): TokenTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
  };
}
