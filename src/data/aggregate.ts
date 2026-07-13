import { computeBlocks } from "./blocks";
import { Deduplicator } from "./dedup";
import {
  AggregationResult,
  GrandTotal,
  ModelBreakdown,
  ProjectNode,
  UsageEntry,
  UsageRollup,
} from "./types";

function newRollup(key: string, label: string): UsageRollup {
  return {
    key,
    label,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUSD: 0,
    costIsEstimate: true,
    messageCount: 0,
    firstSeen: "",
    lastSeen: "",
    byModel: {},
  };
}

function addModel(rollup: UsageRollup, e: UsageEntry): void {
  let mb: ModelBreakdown | undefined = rollup.byModel[e.model];
  if (!mb) {
    mb = {
      model: e.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      costUSD: 0,
      messageCount: 0,
    };
    rollup.byModel[e.model] = mb;
  }
  mb.inputTokens += e.inputTokens;
  mb.outputTokens += e.outputTokens;
  mb.cacheCreationTokens += e.cacheCreationTokens;
  mb.cacheReadTokens += e.cacheReadTokens;
  mb.totalTokens += e.totalTokens;
  mb.costUSD += e.costUSD;
  mb.messageCount += 1;
}

function accumulate(rollup: UsageRollup, e: UsageEntry): void {
  rollup.inputTokens += e.inputTokens;
  rollup.outputTokens += e.outputTokens;
  rollup.cacheCreationTokens += e.cacheCreationTokens;
  rollup.cacheReadTokens += e.cacheReadTokens;
  rollup.totalTokens += e.totalTokens;
  rollup.costUSD += e.costUSD;
  rollup.messageCount += 1;
  if (e.timestamp) {
    if (!rollup.firstSeen || e.timestamp < rollup.firstSeen) {
      rollup.firstSeen = e.timestamp;
    }
    if (!rollup.lastSeen || e.timestamp > rollup.lastSeen) {
      rollup.lastSeen = e.timestamp;
    }
  }
  addModel(rollup, e);
}

function upsert(
  map: Map<string, UsageRollup>,
  key: string,
  label: string,
  e: UsageEntry
): void {
  let r = map.get(key);
  if (!r) {
    r = newRollup(key, label);
    map.set(key, r);
  }
  accumulate(r, e);
}

function sortByCostDesc(rollups: UsageRollup[]): UsageRollup[] {
  return rollups.sort((a, b) =>
    b.costUSD !== a.costUSD ? b.costUSD - a.costUSD : b.totalTokens - a.totalTokens
  );
}

/**
 * Reduce a stream of (possibly duplicated) usage entries into the five rollups
 * plus a grand total. Deduplication on messageId:requestId spans the whole set.
 */
export function aggregate(
  entries: Iterable<UsageEntry>,
  windowHours = 5
): AggregationResult {
  const dedup = new Deduplicator();
  const deduped: UsageEntry[] = [];
  const byDay = new Map<string, UsageRollup>();
  const byMonth = new Map<string, UsageRollup>();
  const bySession = new Map<string, UsageRollup>();
  const byProject = new Map<string, UsageRollup>();
  const byModel = new Map<string, UsageRollup>();
  // projectKey → (sessionId → session rollup)
  const projectSessions = new Map<string, Map<string, UsageRollup>>();

  const grand: GrandTotal = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUSD: 0,
    costIsEstimate: true,
    messageCount: 0,
  };

  for (const e of entries) {
    if (!dedup.shouldCount(e.messageId, e.requestId)) {
      continue;
    }
    deduped.push(e);
    upsert(byDay, e.date, e.date, e);
    upsert(byMonth, e.month, e.month, e);
    upsert(bySession, e.sessionId, e.sessionId.slice(0, 8) || e.sessionId, e);
    upsert(byProject, e.projectKey, e.projectLabel || e.projectKey, e);
    upsert(byModel, e.model, e.model, e);

    let sessions = projectSessions.get(e.projectKey);
    if (!sessions) {
      sessions = new Map<string, UsageRollup>();
      projectSessions.set(e.projectKey, sessions);
    }
    upsert(sessions, e.sessionId, e.sessionId.slice(0, 8) || e.sessionId, e);

    grand.inputTokens += e.inputTokens;
    grand.outputTokens += e.outputTokens;
    grand.cacheCreationTokens += e.cacheCreationTokens;
    grand.cacheReadTokens += e.cacheReadTokens;
    grand.totalTokens += e.totalTokens;
    grand.costUSD += e.costUSD;
    grand.messageCount += 1;
  }

  const byProjectSorted = sortByCostDesc(Array.from(byProject.values()));
  const projectTree: ProjectNode[] = byProjectSorted.map((project) => ({
    project,
    sessions: sortByCostDesc(
      Array.from(projectSessions.get(project.key)?.values() ?? [])
    ),
  }));

  return {
    byDay: Array.from(byDay.values()).sort((a, b) => a.key.localeCompare(b.key)),
    byMonth: Array.from(byMonth.values()).sort((a, b) =>
      a.key.localeCompare(b.key)
    ),
    bySession: sortByCostDesc(Array.from(bySession.values())),
    byProject: byProjectSorted,
    byModel: sortByCostDesc(Array.from(byModel.values())),
    projectTree,
    blocks: computeBlocks(deduped, windowHours),
    grandTotal: grand,
  };
}
