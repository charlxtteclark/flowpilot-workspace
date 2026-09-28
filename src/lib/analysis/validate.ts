// Evidence checks — run before recommendations are shown. Each check re-derives
// what it verifies from the raw CSV cells rather than trusting the pipeline.
import type { AnalysisResult, CheckResult, Issue, NormalizedDataset } from "../types";

const YES = /^(yes|y|true|1|canceled|cancelled|churned)$/i;

export function runChecks(ds: NormalizedDataset, scopeIds: Set<string>, problemIds: Set<string>, praiseCount: number, issues: Issue[], unassigned: string[], available: AnalysisResult["available"]): CheckResult[] {
  const byId = new Map(ds.records.map((r) => [r.id, r]));
  const col = ds.mapping;
  const checks: CheckResult[] = [];

  // Evidence: every recommendation has source comments that exist, and quotes come from its own comments.
  {
    const f: string[] = [];
    for (const i of issues) {
      if (!i.ids.length) f.push(`${i.name}: no supporting comments`);
      const missing = i.ids.filter((id) => !byId.has(id));
      if (missing.length) f.push(`${i.name}: ${missing.length} ids not in dataset (${missing.slice(0, 3).join(", ")})`);
      const stray = i.quoteIds.filter((q) => !i.ids.includes(q));
      if (stray.length) f.push(`${i.name}: quote ${stray[0]} is not one of its comments`);
      if (!i.quoteIds.length && i.ids.length) f.push(`${i.name}: no verbatim selected`);
    }
    checks.push({ id: "evidence", label: "Evidence-backed", pass: !f.length, failures: f, detail: `${issues.length} issues, each traced to ${issues.reduce((s, i) => s + i.ids.length, 0)} source comments in total.` });
  }

  // Metrics: recompute counts, average rating and cancellations from raw cells.
  {
    const f: string[] = [];
    for (const i of issues) {
      const rows = i.ids.map((id) => byId.get(id)!).filter(Boolean);
      if (rows.length !== i.metrics.count) f.push(`${i.name}: count ${i.metrics.count} ≠ ${rows.length}`);
      if (col.rating && i.metrics.avgRating != null) {
        const vals = rows.map((r) => Number(r.raw[col.rating!]?.replace(/[$,\s]/g, ""))).filter((n) => Number.isFinite(n) && r_ok(n));
        const avg = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
        if (Math.abs(avg - i.metrics.avgRating) > 1e-9) f.push(`${i.name}: avg rating ${i.metrics.avgRating} ≠ ${avg}`);
      }
      if (col.canceled && i.metrics.cancellations != null) {
        const c = rows.filter((r) => YES.test(r.raw[col.canceled!] ?? "")).length;
        if (c !== i.metrics.cancellations) f.push(`${i.name}: cancellations ${i.metrics.cancellations} ≠ ${c}`);
      }
    }
    checks.push({ id: "metrics", label: "Metrics verified", pass: !f.length, failures: f, detail: "Counts, average ratings and cancellations re-derived from raw CSV cells for every issue." });
  }

  // No fabrication: every displayed quote is the exact source cell.
  {
    const f: string[] = [];
    let n = 0;
    for (const i of issues) for (const q of i.quoteIds) {
      n++;
      const r = byId.get(q);
      const cell = r?.raw[col.comment!]?.trim();
      if (!r || cell !== r.text) f.push(`${q}: displayed text does not match the source row`);
    }
    checks.push({ id: "fabrication", label: "Quotes match source", pass: !f.length, failures: f, detail: `${n} quotes matched character-for-character to their source rows.` });
  }

  // Missing data: no business or customer claims without the fields to support them.
  {
    const f: string[] = [];
    const hasBiz = available.canceled || available.churnRisk || available.outcome;
    const hasCust = available.segment || available.plan || available.acv;
    for (const i of issues) {
      const b = i.signals.find((s) => s.key === "business")!;
      const c = i.signals.find((s) => s.key === "customer")!;
      const sv = i.signals.find((s) => s.key === "severity")!;
      if (!hasBiz && b.grade !== "N/A") f.push(`${i.name}: business impact graded without business fields`);
      if (!hasCust && c.grade !== "N/A") f.push(`${i.name}: customer impact graded without account fields`);
      if (!available.rating && !available.sentiment && sv.grade !== "N/A") f.push(`${i.name}: severity graded without rating or sentiment`);
      if (!available.canceled && i.metrics.cancellations != null) f.push(`${i.name}: cancellation count shown without a cancellation field`);
    }
    const absent = [!available.canceled && "cancellation", !available.churnRisk && "churn risk", !available.acv && "contract value", !available.rating && "rating"].filter(Boolean);
    checks.push({ id: "missing", label: "No unsupported business claims", pass: !f.length, failures: f, detail: absent.length ? `Not claimed because the fields are missing: ${absent.join(", ")}.` : "All business signals come from fields present in the dataset." });
  }

  // Consistency: each comment counted once; totals add up.
  {
    const f: string[] = [];
    const seen = new Map<string, string>();
    for (const i of issues) for (const id of i.ids) {
      if (seen.has(id)) f.push(`${id} is in both "${seen.get(id)}" and "${i.name}"`);
      seen.set(id, i.name);
      if (!problemIds.has(id)) f.push(`${id} in "${i.name}" is not a problem comment in scope`);
    }
    const assigned = issues.reduce((s, i) => s + i.ids.length, 0);
    if (assigned + unassigned.length !== problemIds.size) f.push(`Assigned ${assigned} + unassigned ${unassigned.length} ≠ ${problemIds.size} problem comments`);
    if (problemIds.size + praiseCount !== scopeIds.size) f.push(`Problems ${problemIds.size} + praise ${praiseCount} ≠ ${scopeIds.size} comments in scope`);
    checks.push({ id: "consistency", label: "Counts consistent", pass: !f.length, failures: f.slice(0, 8), detail: `${assigned} problem comments assigned to exactly one issue${unassigned.length ? `, ${unassigned.length} unassigned` : ""}; ${praiseCount} praise comments kept separate.` });
  }
  return checks;
}
const r_ok = (n: number) => n >= 0;
