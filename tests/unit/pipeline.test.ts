import { readFileSync } from "fs";
import { describe, expect, test } from "vitest";
import { parseCsv } from "../../src/lib/ingest/parseCsv";
import { detectMapping } from "../../src/lib/ingest/schema";
import { normalize } from "../../src/lib/ingest/normalize";
import { analyze } from "../../src/lib/analysis/pipeline";
import { reconcile, alignKeys } from "../../src/lib/analysis/aiCluster";
import { applyDecisions } from "../../src/lib/review/decisions";
import { DEFAULT_WEIGHTS } from "../../src/lib/instructions";
import type { Decision } from "../../src/lib/types";

const load = (f: string) => { const raw = parseCsv(readFileSync(f, "utf8"), f); return { raw, ds: normalize(raw, detectMapping(raw.columns, raw.rows)) }; };
const full = load("src/data/flowpilot_feedback.csv");
const res = analyze(full.ds, DEFAULT_WEIGHTS);
const byName = (n: string) => res.issues.find((i) => i.name.includes(n))!;

// Independent reference: read the CSV with a naive split (no quoted commas in the numeric columns we need).
const csvRows = readFileSync("src/data/flowpilot_feedback.csv", "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  const m = l.match(/^(F\d+),([^,]+),([^,]+),("(?:[^"]|"")*"|[^,]*),(.*)$/)!;
  const rest = m[5].split(",");
  return { id: m[1], text: m[4].replace(/^"|"$/g, "").replace(/""/g, '"'), area: rest[5], rating: Number(rest[6]), canceled: rest[8] === "Yes" };
});

describe("FlowPilot dataset", () => {
  test("schema detection finds the core fields", () => {
    for (const r of ["comment", "rating", "segment", "area", "canceled", "churnRisk", "acv", "account", "outcome"]) expect(full.ds.mapping).toHaveProperty(r);
    expect(full.ds.records).toHaveLength(90);
  });
  test("produces 5–8 prioritized issues and passes every check", () => {
    expect(res.issues.length).toBeGreaterThanOrEqual(5);
    expect(res.issues.length).toBeLessThanOrEqual(9);
    expect(res.checks.every((c) => c.pass)).toBe(true);
  });
  test("Salesforce metrics match the source rows", () => {
    const sf = byName("Salesforce");
    const ref = csvRows.filter((r) => r.area === "Integrations");
    expect(sf.metrics.count).toBe(ref.length);
    expect(sf.metrics.avgRating).toBeCloseTo(ref.reduce((a, r) => a + r.rating, 0) / ref.length, 9);
    expect(sf.metrics.cancellations).toBe(ref.filter((r) => r.canceled).length);
    expect(sf.metrics.count).toBe(10); expect(sf.metrics.avgRating).toBe(1.5); expect(sf.metrics.cancellations).toBe(4);
    expect(sf.priority).toBe("High"); expect(sf.priorityRank).toBe(1);
  });
  test("most frequent issue is not the top priority", () => {
    const dash = byName("Dashboard");
    expect(dash.freqRank).toBe(1);
    expect(dash.metrics.count).toBe(24);
    expect(dash.priority).toBe("Lower");
  });
  test("every verbatim is an exact source comment belonging to its issue", () => {
    const texts = new Map(csvRows.map((r) => [r.id, r.text]));
    for (const i of res.issues) for (const q of i.quoteIds) {
      expect(i.ids).toContain(q);
      expect(full.ds.records.find((r) => r.id === q)!.text).toBe(texts.get(q));
    }
  });
  test("each problem comment is counted once", () => {
    const all = res.issues.flatMap((i) => i.ids);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length + res.unassignedIds.length).toBe(res.problemCount);
    expect(res.problemCount + res.praiseCount).toBe(90);
  });
  test("filters recompute on the subset", () => {
    const ent = analyze(full.ds, DEFAULT_WEIGHTS, { areas: [], segments: ["Enterprise"], ratings: [], canceled: "any", polarity: "any", sentiments: [], priorities: [] });
    expect(ent.scopeCount).toBe(full.ds.records.filter((r) => r.segment === "Enterprise").length);
    expect(ent.issues.every((i) => i.ids.every((id) => full.ds.records.find((r) => r.id === id)!.segment === "Enterprise"))).toBe(true);
    const canc = analyze(full.ds, DEFAULT_WEIGHTS, { areas: [], segments: [], ratings: [], canceled: "yes", polarity: "any", sentiments: [], priorities: [] });
    expect(canc.scopeCount).toBe(4);
  });
  test("reviewer decisions overlay without changing system output", () => {
    const sf = byName("Salesforce");
    const d: Decision = { issueKey: sf.key, status: "modified", priority: "Medium", note: "Already committed to Q4 roadmap", systemPriority: "High", systemName: sf.name, systemArea: sf.area, feedbackIds: sf.ids, updatedAt: new Date().toISOString() };
    const r = applyDecisions(res.issues, [d]).find((i) => i.key === sf.key)!;
    expect(r.finalPriority).toBe("Medium"); expect(r.priority).toBe("High"); expect(r.reviewState).toBe("modified");
  });
});

describe("missing metadata", () => {
  const c = load("src/data/flowpilot_comments_only.csv");
  const r = analyze(c.ds, DEFAULT_WEIGHTS);
  test("comments-only file still analyzes, drops padding columns, claims no business impact", () => {
    expect(c.ds.records).toHaveLength(90);
    expect(c.ds.mapping.rating).toBeUndefined();
    expect(r.checks.every((x) => x.pass)).toBe(true);
    for (const i of r.issues) {
      expect(i.signals.find((s) => s.key === "business")!.grade).toBe("N/A");
      expect(i.metrics.cancellations).toBeNull();
      expect(i.priority).not.toBe("High"); // frequency alone can't justify High
    }
  });
  test("odd headers and a missing id column", () => {
    const raw = parseCsv('Review,Stars,Category\n"Sync keeps failing, we may cancel",1,Integrations\nLove the templates,5,Templates\nLogin broken on mobile,2,Mobile\n', "x.csv");
    const ds = normalize(raw, detectMapping(raw.columns, raw.rows));
    expect(ds.mapping.comment).toBe("Review"); expect(ds.mapping.rating).toBe("Stars"); expect(ds.mapping.area).toBe("Category");
    const a = analyze(ds, DEFAULT_WEIGHTS);
    expect(a.problemCount).toBe(2); expect(a.praiseCount).toBe(1);
    expect(a.checks.every((x) => x.pass)).toBe(true);
  });
  test("a file without a comment column is rejected with a clear message", () => {
    const raw = parseCsv("a,b\n1,2\n", "y.csv");
    expect(() => normalize(raw, detectMapping(raw.columns, raw.rows))).toThrow(/comment/);
  });
});

describe("Claude-assisted clustering guardrails", () => {
  const problems = full.ds.records.filter((r) => r.polarity === "problem");
  test("unknown and duplicate ids are rejected; metrics come from the data", () => {
    const rep = reconcile({ issues: [
      { name: "Sync trust", product_area: "Integrations", feedback_ids: ["F025", "F026", "F999", "F025"], problem: "p", investigate_next: "q" },
      { name: "Other", product_area: "X", feedback_ids: ["F026", "F035"], problem: "p", investigate_next: "q" },
    ] }, problems);
    expect(rep.dropped).toEqual(["F999"]);
    expect(rep.reassigned).toEqual(["F025", "F026"]);
    const aligned = alignKeys(rep.clusters, res.issues.map((i) => ({ key: i.key, ids: i.ids })));
    const a = analyze(full.ds, DEFAULT_WEIGHTS, undefined, aligned);
    expect(a.engine).toBe("claude");
    expect(a.issues.find((i) => i.name === "Sync trust")!.metrics.count).toBe(2);
    expect(a.checks.every((c) => c.pass)).toBe(true);
  });
});
