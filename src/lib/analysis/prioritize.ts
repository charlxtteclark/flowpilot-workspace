// 5. Priority analysis — measure each issue on separate signals, then combine them
// with visible weights. Every number here is computed from the records passed in.
import type { FeedbackRecord, Grade, IssueMetrics, Priority, Signal, Weights } from "../types";
import { bestTheme } from "./themes";
import { countBy } from "./cluster";

export interface Availability {
  rating: boolean; segment: boolean; plan: boolean; acv: boolean; account: boolean; area: boolean;
  canceled: boolean; churnRisk: boolean; outcome: boolean; escalation: boolean; release: boolean;
  source: boolean; sentiment: boolean; date: boolean; ltv: boolean;
}

export interface ScopeContext {
  problemCount: number;
  ratingMax?: number;
  avail: Availability;
  topValueSegment?: string;   // segment with the highest median ACV
  acvP75?: number;            // 75th percentile of non-zero ACV in scope
  releasesInScope: number;
}

export const NEG_OUTCOME = /risk|recur|delay|churn|cancel|lost|downgrad|blocked|escalat/i;
const CANCEL_LANGUAGE = /\bcancel\w*|\bchurn\w*|stopped using|switch(ing)? to|leaving\b/i;

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const money = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);
export const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export function buildScope(records: FeedbackRecord[], problemCount: number, ratingMax: number | undefined, avail: Availability): ScopeContext {
  let topValueSegment: string | undefined;
  if (avail.segment && avail.acv) {
    const bySeg = new Map<string, number[]>();
    for (const r of records) if (r.segment && r.acv != null) { if (!bySeg.has(r.segment)) bySeg.set(r.segment, []); bySeg.get(r.segment)!.push(r.acv); }
    if (bySeg.size > 1) {
      let best = -1;
      for (const [s, v] of bySeg) { const m = median(v)!; if (m > best) { best = m; topValueSegment = s; } }
    }
  }
  const acvs = records.map((r) => r.acv).filter((n): n is number => n != null && n > 0);
  return {
    problemCount, ratingMax, avail, topValueSegment,
    acvP75: acvs.length ? quantile(acvs, 0.75) : undefined,
    releasesInScope: new Set(records.map((r) => r.release).filter(Boolean)).size,
  };
}

export function computeMetrics(recs: FeedbackRecord[], themeId: string, sc: ScopeContext): IssueMetrics {
  const a = sc.avail;
  const seen = new Set<string>(); let duplicates = 0;
  for (const r of recs) { const k = `${r.account ?? ""}|${r.text.toLowerCase()}`; if (seen.has(k)) duplicates++; else seen.add(k); }
  const rated = recs.filter((r) => r.rating != null);
  const acvByAccount = new Map<string, number>();
  recs.forEach((r, i) => { if (r.acv == null) return; const k = r.account ?? `row${i}`; acvByAccount.set(k, Math.max(acvByAccount.get(k) ?? 0, r.acv)); });
  const dates = recs.map((r) => r.date).filter((d): d is string => !!d).sort();
  const outcomes = countBy(recs.filter((r) => r.outcome && NEG_OUTCOME.test(r.outcome)), (r) => r.outcome);
  return {
    count: recs.length,
    share: sc.problemCount ? recs.length / sc.problemCount : 0,
    uniqueAccounts: a.account ? new Set(recs.map((r) => r.account).filter(Boolean)).size : null,
    duplicates,
    avgRating: a.rating && rated.length ? rated.reduce((s, r) => s + r.rating!, 0) / rated.length : null,
    avgRating5: a.rating && rated.length ? rated.reduce((s, r) => s + r.rating5!, 0) / rated.length : null,
    ratingMax: sc.ratingMax,
    escalations: a.escalation ? recs.filter((r) => r.escalated).length : null,
    cancellations: a.canceled ? recs.filter((r) => r.canceled).length : null,
    canceledAccounts: a.canceled ? new Set(recs.filter((r) => r.canceled).map((r) => r.account ?? r.id)).size : null,
    highChurn: a.churnRisk ? recs.filter((r) => r.churnRisk === "High").length : null,
    mediumChurn: a.churnRisk ? recs.filter((r) => r.churnRisk === "Medium").length : null,
    acvExposure: a.acv ? [...acvByAccount.values()].reduce((s, v) => s + v, 0) : null,
    medianAcv: a.acv ? median(recs.map((r) => r.acv).filter((n): n is number => n != null)) : null,
    negativeOutcomes: sorted(outcomes).map(({ name, count }) => ({ label: name, count })),
    segments: sorted(countBy(recs, (r) => r.segment)),
    plans: sorted(countBy(recs, (r) => r.plan)),
    sources: sorted(countBy(recs, (r) => r.source)),
    releases: sorted(countBy(recs, (r) => r.release)),
    dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : null,
    cancelMentions: recs.filter((r) => CANCEL_LANGUAGE.test(r.text)).length,
    themeConsistency: recs.length ? recs.filter((r) => bestTheme(r.text).id === themeId).length / recs.length : 0,
  };
}

const G: Record<Grade, number> = { High: 2, Medium: 1, Low: 0, "N/A": 0 };

export interface Graded {
  signals: Signal[];
  score: number;
  priority: Priority;
  cap?: string;
  confidence: "High" | "Medium" | "Low";
  confidenceWhy: string;
  paidShare: number | null;
  topSegShare: number;
  independent: number;
}

export function gradeIssue(m: IssueMetrics, recs: FeedbackRecord[], sc: ScopeContext, w: Weights): Graded {
  const a = sc.avail;
  const n = m.count;
  const signals: Signal[] = [];

  // Frequency
  signals.push({
    key: "frequency", label: "Frequency",
    grade: m.share >= 0.2 ? "High" : m.share >= 0.1 ? "Medium" : "Low",
    value: `${n} comment${n === 1 ? "" : "s"}`,
    detail: `${pct(m.share)} of ${sc.problemCount} problem comments in scope. High ≥ 20%, Medium ≥ 10%.`,
  });

  // Severity
  if (m.avgRating5 != null) {
    const g: Grade = m.avgRating5 <= 2.0 ? "High" : m.avgRating5 <= 2.75 ? "Medium" : "Low";
    const low = recs.filter((r) => (r.rating5 ?? 5) <= 2).length;
    signals.push({
      key: "severity", label: "Severity", grade: g,
      value: `${r1(m.avgRating!)} / ${m.ratingMax}`,
      detail: `Average rating; ${low} of ${n} rated ≤ 2${m.ratingMax !== 5 ? " (on a 1–5 equivalent)" : ""}.${m.escalations != null ? ` ${m.escalations} of ${n} escalated to support.` : ""} High ≤ 2.0, Medium ≤ 2.75 (on a 5-point scale).`,
    });
  } else if (a.sentiment) {
    const neg = recs.filter((r) => /neg/i.test(r.sentiment ?? "")).length / Math.max(n, 1);
    signals.push({ key: "severity", label: "Severity", grade: neg >= 0.6 ? "High" : neg >= 0.3 ? "Medium" : "Low", value: `${pct(neg)} negative`, detail: "Share of comments with negative sentiment (no rating column). High ≥ 60%, Medium ≥ 30%." });
  } else {
    signals.push({ key: "severity", label: "Severity", grade: "N/A", value: "Not available", detail: "The dataset has no rating or sentiment column, so severity is not scored." });
  }

  // Customer impact
  let paidShare: number | null = null; let topSegShare = 0;
  if (a.segment || a.plan || a.acv) {
    const paid = recs.filter((r) => (r.plan ? !/free|trial/i.test(r.plan) : false) || (r.acv ?? 0) > 0).length;
    paidShare = a.plan || a.acv ? paid / Math.max(n, 1) : null;
    topSegShare = sc.topValueSegment ? recs.filter((r) => r.segment === sc.topValueSegment).length / Math.max(n, 1) : 0;
    const highAcv = sc.acvP75 != null && m.medianAcv != null && m.medianAcv > 0 && m.medianAcv >= sc.acvP75;
    let g: Grade;
    if ((sc.topValueSegment && topSegShare >= 0.5) || highAcv) g = "High";
    else if ((paidShare != null && paidShare >= 0.5) || topSegShare >= 0.25) g = "Medium";
    else if (paidShare == null && !sc.topValueSegment) g = "N/A";
    else g = "Low";
    const segs = m.segments.map((s) => `${s.name} ${s.count}`).join(" · ");
    const parts: string[] = [];
    if (sc.topValueSegment) parts.push(`${pct(topSegShare)} from ${sc.topValueSegment}, the segment with the highest median ACV`);
    if (m.medianAcv != null) parts.push(`median ACV ${money(m.medianAcv)} vs. ${sc.acvP75 != null ? money(sc.acvP75) : "n/a"} (75th percentile in scope)`);
    if (paidShare != null) parts.push(`${pct(paidShare)} paying accounts`);
    signals.push({
      key: "customer", label: "Customer impact", grade: g,
      value: segs || (paidShare != null ? `${pct(paidShare)} paying` : "—"),
      detail: g === "N/A" ? "Segment values alone can't say which customers matter more; add plan or ACV." : `${parts.join("; ")}. High = mostly the highest-value segment or top-quartile ACV; Medium = mostly paying accounts.`,
    });
  } else {
    signals.push({ key: "customer", label: "Customer impact", grade: "N/A", value: "Not available", detail: "No segment, plan or contract-value column." });
  }

  // Business impact
  if (a.canceled || a.churnRisk || a.outcome) {
    const canc = m.cancellations ?? 0;
    const hi = (m.highChurn ?? 0) / Math.max(n, 1);
    const himed = ((m.highChurn ?? 0) + (m.mediumChurn ?? 0)) / Math.max(n, 1);
    const negOut = m.negativeOutcomes.reduce((s, o) => s + o.count, 0);
    let g: Grade = "Low";
    if (canc >= 2 || canc / Math.max(n, 1) >= 0.2 || hi >= 0.5) g = "High";
    else if (canc >= 1 || hi >= 0.2 || (a.churnRisk && himed >= 0.5) || negOut >= 1) g = "Medium";
    const parts: string[] = [];
    if (m.cancellations != null) parts.push(`${canc} canceled`);
    if (m.highChurn != null) parts.push(`${m.highChurn}/${n} high churn risk`);
    if (m.mediumChurn != null && m.mediumChurn) parts.push(`${m.mediumChurn}/${n} medium`);
    if (negOut) parts.push(m.negativeOutcomes.map((o) => `${o.label} (${o.count})`).join(", "));
    signals.push({
      key: "business", label: "Business impact", grade: g,
      value: m.cancellations != null ? `${canc} cancellation${canc === 1 ? "" : "s"}` : m.highChurn != null ? `${m.highChurn} high churn` : `${negOut} negative outcomes`,
      detail: `${parts.join(" · ")}${m.acvExposure != null ? ` · ${money(m.acvExposure)} ACV across affected accounts` : ""}. High = 2+ cancellations, ≥ 20% canceled, or ≥ 50% high churn risk; Medium = any cancellation, ≥ 20% high risk, mostly medium-or-high risk, or a negative outcome.`,
    });
  } else {
    signals.push({ key: "business", label: "Business impact", grade: "N/A", value: "Not available", detail: "No cancellation, churn-risk or outcome column, so business impact is not claimed." });
  }

  // Evidence strength
  const independent = m.uniqueAccounts ?? new Set(recs.map((r) => r.text.toLowerCase())).size;
  const eg: Grade = independent >= 8 && m.themeConsistency >= 0.6 ? "High" : independent >= 4 ? "Medium" : "Low";
  signals.push({
    key: "evidence", label: "Evidence strength", grade: eg,
    value: `${independent} ${m.uniqueAccounts != null ? "accounts" : "distinct comments"}`,
    detail: `${independent} independent ${m.uniqueAccounts != null ? "accounts" : "comments"}${m.duplicates ? `, ${m.duplicates} word-for-word repeat${m.duplicates === 1 ? "" : "s"} not counted` : ""}; ${m.sources.length || "?"} source type${m.sources.length === 1 ? "" : "s"}; ${pct(m.themeConsistency)} of comments match the issue theme. High ≥ 8 accounts and ≥ 60% consistent; Medium ≥ 4.`,
  });

  // Weighted score over the signals that exist in this dataset.
  const wmap: Record<Signal["key"], number> = { frequency: w.frequency, severity: w.severity, customer: w.customer, business: w.business, evidence: w.evidence };
  let num = 0; let den = 0;
  for (const s of signals) { if (s.grade === "N/A") continue; num += wmap[s.key] * G[s.grade]; den += wmap[s.key] * 2; }
  const score = den ? num / den : 0;
  let priority: Priority = score >= w.highThreshold ? "High" : score >= w.mediumThreshold ? "Medium" : "Lower";
  let cap: string | undefined;
  const impactKnown = signals.some((s) => (s.key === "severity" || s.key === "business" || s.key === "customer") && s.grade !== "N/A");
  if (priority === "High" && eg === "Low") { priority = "Medium"; cap = `Capped at Medium: only ${independent} independent ${m.uniqueAccounts != null ? "accounts" : "comments"} support it.`; }
  if (priority === "High" && !impactKnown) { priority = "Medium"; cap = "Capped at Medium: without severity, customer or business fields this ranking rests on frequency alone."; }

  const available = signals.filter((s) => s.grade !== "N/A").length;
  let confidence: Graded["confidence"] = "Medium";
  if (eg === "High" && available >= 4 && m.themeConsistency >= 0.7) confidence = "High";
  if (eg === "Low" || available <= 2) confidence = "Low";
  const confidenceWhy = `${independent} independent ${m.uniqueAccounts != null ? "accounts" : "comments"}; ${available} of 5 signals measurable; ${pct(m.themeConsistency)} theme consistency.`;

  return { signals, score, priority, cap, confidence, confidenceWhy, paidShare, topSegShare, independent };
}

const PRI_ORDER: Record<Priority, number> = { High: 0, Medium: 1, Lower: 2 };
export const priorityOrder = (p: Priority) => PRI_ORDER[p];
