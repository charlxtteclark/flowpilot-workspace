// Orchestrates: scope (filters) → clustering → metrics → prioritization → narrative → evidence → checks.
import type { AnalysisResult, DataNote, FeedbackRecord, Issue, NormalizedDataset, Weights } from "../types";
import { clusterRules, slug, type Cluster } from "./cluster";
import { buildScope, computeMetrics, gradeIssue, priorityOrder, type Availability } from "./prioritize";
import { businessSignal, concentration, customerImpact, rationale, whyItMatters } from "./narrative";
import { pickQuotes } from "./evidence";
import { runChecks } from "./validate";
import { themeById, GENERIC_THEME } from "./themes";

export interface Filters {
  areas: string[];
  segments: string[];
  ratings: string[];      // rating values as strings
  canceled: "any" | "yes" | "no";
  polarity: "any" | "problem" | "praise";
  sentiments: string[];
  priorities: string[];   // applied at display time
}
export const EMPTY_FILTERS: Filters = { areas: [], segments: [], ratings: [], canceled: "any", polarity: "any", sentiments: [], priorities: [] };

export interface AiCluster { key: string; name: string; area: string; ids: string[]; problem: string; investigateNext: string }

export function availability(ds: NormalizedDataset): Availability {
  const has = (f: (r: FeedbackRecord) => unknown) => ds.records.some((r) => { const v = f(r); return v !== undefined && v !== null && v !== ""; });
  return {
    rating: has((r) => r.rating), segment: has((r) => r.segment), plan: has((r) => r.plan), acv: has((r) => r.acv),
    account: has((r) => r.account), area: has((r) => r.area), canceled: has((r) => r.canceled), churnRisk: has((r) => r.churnRisk),
    outcome: has((r) => r.outcome), escalation: has((r) => r.escalated), release: has((r) => r.release), source: has((r) => r.source),
    sentiment: has((r) => r.sentiment), date: has((r) => r.date), ltv: has((r) => r.ltv),
  };
}

export function applyFilters(records: FeedbackRecord[], f: Filters): FeedbackRecord[] {
  return records.filter((r) =>
    (!f.areas.length || f.areas.includes(r.area ?? "")) &&
    (!f.segments.length || f.segments.includes(r.segment ?? "")) &&
    (!f.ratings.length || f.ratings.includes(r.rating != null ? String(r.rating) : "")) &&
    (f.canceled === "any" || (f.canceled === "yes" ? r.canceled === true : r.canceled === false)) &&
    (f.polarity === "any" || r.polarity === f.polarity) &&
    (!f.sentiments.length || f.sentiments.includes(r.sentiment ?? "")));
}

export function analyze(ds: NormalizedDataset, weights: Weights, filters: Filters = EMPTY_FILTERS, ai?: AiCluster[]): AnalysisResult {
  const avail = availability(ds);
  const scope = applyFilters(ds.records, filters);
  const problems = scope.filter((r) => r.polarity === "problem");
  const praise = scope.filter((r) => r.polarity === "praise");
  const byId = new Map(ds.records.map((r) => [r.id, r]));
  const problemIds = new Set(problems.map((r) => r.id));

  let clusters: (Cluster & { name?: string; problem?: string; investigateNext?: string })[];
  if (ai) {
    clusters = ai.map((c) => ({ key: c.key, themeId: inferTheme(c.ids.map((id) => byId.get(id)!).filter(Boolean)), area: c.area, ids: c.ids.filter((id) => problemIds.has(id)), name: c.name, problem: c.problem, investigateNext: c.investigateNext }))
      .filter((c) => c.ids.length);
  } else {
    clusters = clusterRules(problems, avail.area);
  }
  const assigned = new Set(clusters.flatMap((c) => c.ids));
  const unassignedIds = problems.filter((r) => !assigned.has(r.id)).map((r) => r.id);

  const sc = buildScope(scope, problems.length, ds.ratingMax, avail);
  let issues: Issue[] = clusters.map((c) => {
    const recs = c.ids.map((id) => byId.get(id)!);
    const m = computeMetrics(recs, c.themeId, sc);
    const g = gradeIssue(m, recs, sc, weights);
    const theme = themeById(c.themeId);
    const plans = m.plans;
    const ctx = {
      texts: recs.map((r) => r.text), n: recs.length,
      topSegment: m.segments[0] ? { name: m.segments[0].name, share: m.segments[0].count / recs.length } : undefined,
      cancellations: m.cancellations, release: m.releases[0] && sc.releasesInScope > 1 ? { name: m.releases[0].name, share: m.releases[0].count / recs.length } : undefined,
      freePlanShare: plans.length ? (plans.find((p) => /free/i.test(p.name))?.count ?? 0) / recs.length : null,
    };
    const sysName = c.name ?? (c.themeId === GENERIC_THEME.id && c.area !== "Not provided" ? `${c.area} issues` : theme.name(ctx));
    return {
      key: c.key, themeId: c.themeId, name: sysName, area: c.area, ids: c.ids, metrics: m,
      signals: g.signals, score: g.score, priority: g.priority, priorityCapped: g.cap,
      confidence: g.confidence, confidenceWhy: g.confidenceWhy,
      rationale: rationale(g.priority, m, g, sc, concentration(m, recs, sc)),
      problem: c.problem ?? theme.problem(ctx),
      whyItMatters: whyItMatters(m, g, sc),
      customerImpact: customerImpact(m),
      businessSignal: businessSignal(m, avail),
      investigateNext: c.investigateNext ?? theme.investigate(ctx),
      concentration: concentration(m, recs, sc),
      quoteIds: pickQuotes(recs),
      aiDrafted: !!c.problem,
      freqRank: 0, priorityRank: 0,
    };
  });

  const byFreq = [...issues].sort((a, b) => b.metrics.count - a.metrics.count || b.score - a.score);
  byFreq.forEach((i, k) => (i.freqRank = k + 1));
  issues = issues.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority) || b.score - a.score || b.metrics.count - a.metrics.count);
  issues.forEach((i, k) => (i.priorityRank = k + 1));

  const praiseMap = new Map<string, string[]>();
  for (const r of praise) { const k = r.area ?? "General"; if (!praiseMap.has(k)) praiseMap.set(k, []); praiseMap.get(k)!.push(r.id); }

  const available = avail as unknown as Record<string, boolean>;
  const checks = runChecks(ds, new Set(scope.map((r) => r.id)), problemIds, praise.length, issues, unassignedIds, available);

  return {
    engine: ai ? "claude" : "rules",
    ranAt: new Date().toISOString(),
    scopeCount: scope.length, problemCount: problems.length, praiseCount: praise.length,
    issues,
    praiseByArea: [...praiseMap.entries()].map(([area, ids]) => ({ area, count: ids.length, ids })).sort((a, b) => b.count - a.count),
    unassignedIds, checks, notes: dataNotes(ds, scope), available,
  };
}

function inferTheme(recs: FeedbackRecord[]): string {
  const counts = new Map<string, number>();
  for (const r of recs) for (const t of ["integration_sync", "login_auth", "permissions", "performance", "billing", "dashboard_custom", "reporting_guidance", "onboarding"]) {
    const th = themeById(t); th.pattern.lastIndex = 0;
    if ((r.text.match(th.pattern) ?? []).length) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? GENERIC_THEME.id;
}

export function dataNotes(ds: NormalizedDataset, scope: FeedbackRecord[]): DataNote[] {
  const notes: DataNote[] = [];
  const seen = new Map<string, string>(); const dups: string[] = [];
  for (const r of scope) { const k = `${r.account ?? ""}|${r.text.toLowerCase()}`; if (seen.has(k)) dups.push(`${r.id} repeats ${seen.get(k)}`); else seen.set(k, r.id); }
  if (dups.length) notes.push({ kind: "warn", text: `${dups.length} comment${dups.length === 1 ? "" : "s"} repeat an earlier comment from the same account word-for-word (e.g. ${dups.slice(0, 2).join("; ")}). They count toward volume but not toward independent evidence.` });
  const acvs = new Map<string, Set<number>>();
  for (const r of scope) if (r.account && r.acv != null) { if (!acvs.has(r.account)) acvs.set(r.account, new Set()); acvs.get(r.account)!.add(r.acv); }
  const incons = [...acvs.entries()].filter(([, s]) => s.size > 1);
  if (incons.length) notes.push({ kind: "warn", text: `${incons.length} account${incons.length === 1 ? " has" : "s have"} different contract values on different rows (e.g. ${incons.slice(0, 2).map(([a, s]) => `${a}: ${[...s].map((v) => "$" + v.toLocaleString()).join(" / ")}`).join("; ")}). ACV exposure uses the highest value per account.` });
  const segs = new Map<string, number[]>();
  for (const r of scope) if (r.segment && r.acv != null) { if (!segs.has(r.segment)) segs.set(r.segment, []); segs.get(r.segment)!.push(r.acv); }
  if (ds.droppedColumns.length) notes.push({ kind: "info", text: `Ignored empty or unnamed columns: ${ds.droppedColumns.join(", ")}.` });
  for (const w of ds.warnings) notes.push({ kind: "warn", text: w });
  const praise = scope.filter((r) => r.polarity === "praise").length;
  notes.push({ kind: "info", text: `${praise} of ${scope.length} comments are praise and are kept out of the problem ranking (see “What customers value”).` });
  return notes;
}

export { slug };
