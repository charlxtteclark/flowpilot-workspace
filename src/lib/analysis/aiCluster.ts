// Optional LLM pass: Claude proposes issue groupings, names, problem statements and
// research questions. It never supplies numbers or quotes — the workspace recomputes
// every metric from the data and only accepts feedback ids that exist.
import type { Decision, FeedbackRecord, NormalizedDataset } from "../types";
import type { AiCluster } from "./pipeline";
import { slug } from "./cluster";

type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T>(input: string, opts?: Record<string, unknown>) => Promise<T>;
};

declare global {
  interface Window { claude?: { use: (name: string) => Promise<unknown> } }
}

let samplePromise: Promise<SampleFn | null> | null = null;
export function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    samplePromise = window.claude?.use ? (window.claude.use("sample") as Promise<SampleFn | null>).catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

export interface AiRunReport { clusters: AiCluster[]; dropped: string[]; reassigned: string[]; unassigned: string[] }

export function buildPrompt(instructions: string, problems: FeedbackRecord[], decisions: Decision[]): string {
  const lines = problems.map((r) => [r.id, r.area ?? "", r.rating ?? "", r.segment ?? "", r.canceled == null ? "" : r.canceled ? "canceled" : "", r.text.replace(/\s+/g, " ").slice(0, 280)].join(" | "));
  const corrections = decisions.filter((d) => d.status === "modified" || d.note).slice(0, 30).map((d) =>
    `- System said "${d.systemName}" (${d.systemArea}, ${d.systemPriority}). Reviewer: ${[d.name && d.name !== d.systemName ? `renamed to "${d.name}"` : "", d.area && d.area !== d.systemArea ? `category → ${d.area}` : "", d.priority && d.priority !== d.systemPriority ? `priority → ${d.priority}` : "", d.note ? `note: "${d.note}"` : ""].filter(Boolean).join("; ")}`);
  return `${instructions}

TASK
Group the problem comments below into 4–10 distinct customer problems. Every comment id belongs to at most one problem; leave an id out only if it fits nowhere.
${corrections.length ? `\nEARLIER REVIEWER CORRECTIONS (reuse these names and categories where they still apply):\n${corrections.join("\n")}\n` : ""}
Reply with only JSON in this shape:
{"issues":[{"name":"short problem name","product_area":"category","feedback_ids":["F001"],"problem":"one sentence describing what customers experience","investigate_next":"one research question, not a solution"}]}

Do not include counts, ratings, cancellations or quotes in your text; the workspace computes them.

COMMENTS (id | product area | rating | segment | cancellation | comment)
${lines.join("\n")}`;
}

export async function runAiClustering(ds: NormalizedDataset, instructions: string, decisions: Decision[], signal?: AbortSignal): Promise<AiRunReport> {
  const sample = await getSample();
  if (!sample) throw { code: "not_available", message: "Claude-assisted analysis is only available when this workspace is opened in Claude." };
  const problems = ds.records.filter((r) => r.polarity === "problem").slice(0, 220);
  const prompt = buildPrompt(instructions, problems, decisions);
  const out = await sample.json<{ issues?: { name?: string; product_area?: string; feedback_ids?: unknown[]; problem?: string; investigate_next?: string }[] }>(prompt, { modelTier: "default", signal });
  return reconcile(out, problems);
}

/** Keep only ids that exist and are problems; each id in one issue (first claim wins). */
export function reconcile(out: { issues?: { name?: string; product_area?: string; feedback_ids?: unknown[]; problem?: string; investigate_next?: string }[] }, problems: FeedbackRecord[]): AiRunReport {
  const valid = new Set(problems.map((r) => r.id));
  const claimed = new Set<string>();
  const dropped: string[] = []; const reassigned: string[] = [];
  const clusters: AiCluster[] = [];
  const usedKeys = new Set<string>();
  for (const it of out?.issues ?? []) {
    const ids: string[] = [];
    for (const raw of it.feedback_ids ?? []) {
      const id = String(raw);
      if (!valid.has(id)) { dropped.push(id); continue; }
      if (claimed.has(id)) { reassigned.push(id); continue; }
      claimed.add(id); ids.push(id);
    }
    if (!ids.length || !it.name) continue;
    let key = `ai--${slug(it.name)}`; let k = 2;
    while (usedKeys.has(key)) key = `ai--${slug(it.name)}-${k++}`;
    usedKeys.add(key);
    clusters.push({ key, name: String(it.name).slice(0, 80), area: String(it.product_area ?? "Unspecified").slice(0, 40), ids, problem: String(it.problem ?? "").slice(0, 300), investigateNext: String(it.investigate_next ?? "").slice(0, 300) });
  }
  if (!clusters.length) throw { code: "empty", message: "Claude's reply contained no usable issue groups." };
  const unassigned = problems.filter((r) => !claimed.has(r.id)).map((r) => r.id);
  return { clusters, dropped, reassigned, unassigned };
}

/** Map AI issues onto earlier issue keys by comment overlap so human review carries over. */
export function alignKeys(clusters: AiCluster[], previous: { key: string; ids: string[] }[]): AiCluster[] {
  return clusters.map((c) => {
    let best: { key: string; j: number } | null = null;
    for (const p of previous) {
      const a = new Set(c.ids); const inter = p.ids.filter((id) => a.has(id)).length;
      const j = inter / (c.ids.length + p.ids.length - inter);
      if (j >= 0.5 && (!best || j > best.j)) best = { key: p.key, j };
    }
    return best ? { ...c, key: best.key } : c;
  });
}
