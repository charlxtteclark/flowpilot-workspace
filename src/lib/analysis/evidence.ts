// 6. Evidence retrieval — choose representative verbatims by id. Quotes are never
// rewritten: the UI renders record.text for the chosen ids, and validation re-checks it.
import type { FeedbackRecord } from "../types";

export function pickQuotes(recs: FeedbackRecord[], max = 4): string[] {
  const seenText = new Set<string>();
  const ranked = [...recs].sort((a, b) =>
    Number(!!b.canceled) - Number(!!a.canceled) ||
    (a.rating5 ?? 3) - (b.rating5 ?? 3) ||
    riskRank(b.churnRisk) - riskRank(a.churnRisk) ||
    a.row - b.row);
  // Round-robin across segments so one customer type doesn't dominate the quotes.
  const bySeg = new Map<string, FeedbackRecord[]>();
  for (const r of ranked) {
    const k = r.segment ?? "_";
    if (!bySeg.has(k)) bySeg.set(k, []);
    bySeg.get(k)!.push(r);
  }
  const out: string[] = [];
  const queues = [...bySeg.values()];
  let progressed = true;
  while (out.length < max && progressed) {
    progressed = false;
    for (const q of queues) {
      while (q.length) {
        const r = q.shift()!;
        const key = r.text.toLowerCase();
        if (seenText.has(key)) continue;
        seenText.add(key); out.push(r.id); progressed = true; break;
      }
      if (out.length >= max) break;
    }
  }
  return out;
}
const riskRank = (r?: string) => (r === "High" ? 2 : r === "Medium" ? 1 : 0);
