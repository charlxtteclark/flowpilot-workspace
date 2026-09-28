// 8. Human review — overlay reviewer decisions on system output without erasing it.
import type { Decision, Issue, Priority } from "../types";

export interface ReviewedIssue extends Issue {
  decision?: Decision;
  finalName: string;
  finalArea: string;
  finalPriority: Priority;
  reviewState: "system" | "approved" | "modified";
  carriedOver: boolean; // decision was made against an earlier analysis
}

/** Match a decision by stable key, or by ≥50% comment overlap when the key changed. */
export function findDecision(issue: Issue, decisions: Decision[]): Decision | undefined {
  const exact = decisions.find((d) => d.issueKey === issue.key);
  if (exact) return exact;
  let best: { d: Decision; j: number } | undefined;
  const a = new Set(issue.ids);
  for (const d of decisions) {
    const inter = d.feedbackIds.filter((id) => a.has(id)).length;
    const j = inter / (issue.ids.length + d.feedbackIds.length - inter || 1);
    if (j >= 0.5 && (!best || j > best.j)) best = { d, j };
  }
  return best?.d;
}

export function applyDecisions(issues: Issue[], decisions: Decision[]): ReviewedIssue[] {
  return issues.map((i) => {
    const d = findDecision(i, decisions);
    const carriedOver = !!d && (d.systemPriority !== i.priority || d.feedbackIds.length !== i.ids.length || d.feedbackIds.some((id, k) => i.ids[k] !== id));
    return {
      ...i,
      decision: d,
      finalName: d?.name || i.name,
      finalArea: d?.area || i.area,
      finalPriority: d?.priority || i.priority,
      reviewState: d ? d.status : "system",
      carriedOver,
    };
  });
}

export const PRIORITIES: Priority[] = ["High", "Medium", "Lower"];
