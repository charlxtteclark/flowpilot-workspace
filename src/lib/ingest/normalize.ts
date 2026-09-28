// 2. Data normalization — typed records from raw rows, using the detected field mapping.
import type { FeedbackRecord, FieldMapping, NormalizedDataset, RawDataset } from "../types";
import { classifyPolarity } from "../analysis/polarity";

const YES = /^(yes|y|true|1|canceled|cancelled|churned)$/i;
const NO = /^(no|n|false|0|active|retained)$/i;

function num(v?: string): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
function bool(v?: string): boolean | undefined {
  if (v == null || v === "") return undefined;
  if (YES.test(v)) return true;
  if (NO.test(v)) return false;
  return undefined;
}
function risk(v?: string): FeedbackRecord["churnRisk"] {
  if (!v) return undefined;
  if (/^h/i.test(v)) return "High";
  if (/^m/i.test(v)) return "Medium";
  if (/^l/i.test(v)) return "Low";
  return undefined;
}

export function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function normalize(raw: RawDataset, mapping: FieldMapping): NormalizedDataset {
  const warnings = [...raw.parseWarnings];
  if (!mapping.comment) throw new Error("No customer-comment column was found. Map one in Analysis Instructions → Data fields.");
  const get = (r: Record<string, string>, role: keyof FieldMapping) => (mapping[role] ? r[mapping[role]!] : undefined);

  const ratings = raw.rows.map((r) => num(get(r, "rating"))).filter((n): n is number => n != null);
  const ratingMax = ratings.length ? (Math.max(...ratings) <= 5 ? 5 : Math.max(...ratings) <= 10 ? 10 : 100) : undefined;

  const usedIds = new Set<string>();
  const records: FeedbackRecord[] = [];
  let skipped = 0;
  raw.rows.forEach((r, i) => {
    const text = (get(r, "comment") ?? "").trim();
    if (!text) { skipped++; return; }
    let id = (get(r, "id") ?? "").trim() || `row-${i + 1}`;
    if (usedIds.has(id)) { warnings.push(`Duplicate feedback id ${id}; row ${i + 1} renamed to ${id}#${i + 1}.`); id = `${id}#${i + 1}`; }
    usedIds.add(id);
    const rating = num(get(r, "rating"));
    const rating5 = rating != null && ratingMax ? (ratingMax === 5 ? rating : 1 + (rating / ratingMax) * 4) : undefined;
    const sentiment = get(r, "sentiment") || undefined;
    const pol = classifyPolarity(text, rating5, sentiment);
    records.push({
      id, row: i + 1, text,
      account: get(r, "account") || undefined,
      date: get(r, "date") || undefined,
      rating, rating5,
      segment: get(r, "segment") || undefined,
      plan: get(r, "plan") || undefined,
      acv: num(get(r, "acv")),
      tenure: num(get(r, "tenure")),
      area: get(r, "area") || undefined,
      usage: get(r, "usage") || undefined,
      canceled: bool(get(r, "canceled")),
      churnRisk: risk(get(r, "churnRisk")),
      escalated: bool(get(r, "escalation")),
      release: get(r, "release") || undefined,
      source: get(r, "source") || undefined,
      sentiment,
      resolution: get(r, "resolution") || undefined,
      action: get(r, "action") || undefined,
      outcome: get(r, "outcome") || undefined,
      ltv: num(get(r, "ltv")),
      polarity: pol.polarity, polarityReason: pol.reason,
      raw: r,
    });
  });
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} had no comment text and were skipped.`);
  if (!records.length) throw new Error("No rows with comment text were found.");

  return {
    name: raw.name,
    hash: hashString(raw.columns.join("|") + "\n" + raw.rows.map((r) => raw.columns.map((c) => r[c]).join("|")).join("\n")),
    mapping, records, ratingMax,
    columns: raw.columns, droppedColumns: raw.droppedColumns, warnings,
  };
}
