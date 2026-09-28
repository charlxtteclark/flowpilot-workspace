// 4. Issue clustering — group problem comments into issues.
// Product area is the primary grouping when the dataset has it; the theme lexicon
// names each group and splits off a distinct secondary theme when it is large enough.
import type { FeedbackRecord } from "../types";
import { bestTheme, GENERIC_THEME } from "./themes";

export interface Cluster {
  key: string;
  themeId: string;
  area: string;
  ids: string[];
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

export function clusterRules(problems: FeedbackRecord[], hasArea: boolean): Cluster[] {
  const themeOf = new Map(problems.map((r) => [r.id, bestTheme(r.text).id]));
  const clusters: Cluster[] = [];

  if (hasArea) {
    const byArea = groupBy(problems, (r) => r.area ?? "Unspecified");
    for (const [area, recs] of byArea) {
      const counts = countBy(recs, (r) => themeOf.get(r.id)!);
      const ranked = [...counts.entries()].filter(([t]) => t !== GENERIC_THEME.id).sort((a, b) => b[1] - a[1]);
      const dominant = ranked[0]?.[0] ?? GENERIC_THEME.id;
      const splits = ranked.slice(1).filter(([, n]) => n >= 3 && n / recs.length >= 0.25).map(([t]) => t);
      const main: string[] = [];
      const split = new Map<string, string[]>(splits.map((t) => [t, []]));
      for (const r of recs) {
        const t = themeOf.get(r.id)!;
        if (split.has(t)) split.get(t)!.push(r.id); else main.push(r.id);
      }
      clusters.push({ key: `${slug(area)}--${dominant}`, themeId: dominant, area, ids: main });
      for (const [t, ids] of split) clusters.push({ key: `${slug(area)}--${t}`, themeId: t, area, ids });
    }
  } else {
    const byTheme = groupBy(problems, (r) => themeOf.get(r.id)!);
    for (const [t, recs] of byTheme) clusters.push({ key: `theme--${t}`, themeId: t, area: "Not provided", ids: recs.map((r) => r.id) });
  }
  return clusters.filter((c) => c.ids.length > 0);
}

export function groupBy<T>(xs: T[], f: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k)!.push(x); }
  return m;
}
export function countBy<T>(xs: T[], f: (x: T) => string | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) { const k = f(x); if (k == null || k === "") continue; m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}
