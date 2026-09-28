// Field detection — map whatever columns a CSV has onto the roles the analysis understands.
import type { FieldMapping, FieldRole } from "../types";

export interface RoleSpec {
  role: FieldRole;
  label: string;
  group: "required" | "core" | "account" | "business" | "context";
  synonyms: RegExp;
  usedFor: string;
}

// Order matters: earlier specs claim a column first.
export const ROLE_SPECS: RoleSpec[] = [
  { role: "comment", label: "Customer comment", group: "required", synonyms: /^(feedback_?text|comment|comments|feedback|verbatim|text|review|message|response|body|description)$/i, usedFor: "Issue identification and verbatim evidence" },
  { role: "id", label: "Feedback ID", group: "context", synonyms: /^(feedback_?id|id|response_?id|comment_?id|ticket_?id)$/i, usedFor: "Traceability of every quote" },
  { role: "rating", label: "Rating", group: "core", synonyms: /^(rating|score|stars|csat|satisfaction|nps)$/i, usedFor: "Severity" },
  { role: "segment", label: "Customer segment", group: "core", synonyms: /^(customer_?segment|segment|tier|customer_?type|company_?size)$/i, usedFor: "Customer impact and concentration" },
  { role: "area", label: "Product area", group: "core", synonyms: /^(product_?area|area|category|feature|component|module|theme)$/i, usedFor: "Issue grouping and category" },
  { role: "canceled", label: "Cancellation status", group: "core", synonyms: /^(canceled|cancelled|churned|cancellation(_?status)?|is_?canceled|is_?churned)$/i, usedFor: "Business impact" },
  { role: "churnRisk", label: "Churn risk", group: "business", synonyms: /^(churn_?risk|risk|health|account_?health)$/i, usedFor: "Business impact" },
  { role: "acv", label: "Annual contract value", group: "business", synonyms: /^(annual_?contract_?value|acv|arr|contract_?value|revenue|mrr)$/i, usedFor: "Revenue exposure and customer impact" },
  { role: "ltv", label: "Customer lifetime value", group: "business", synonyms: /^(ltv|clv|lifetime_?value|customer_?lifetime_?value)$/i, usedFor: "Revenue exposure" },
  { role: "outcome", label: "Outcome after action", group: "business", synonyms: /^(outcome(_?after_?action)?|result|business_?outcome)$/i, usedFor: "Business impact (e.g. expansion delayed)" },
  { role: "sentiment", label: "Customer sentiment", group: "core", synonyms: /^(sentiment|customer_?sentiment|tone)$/i, usedFor: "Severity and praise detection" },
  { role: "account", label: "Account ID", group: "account", synonyms: /^(account_?id|customer_?id|account|customer|company|org_?id)$/i, usedFor: "Independent-evidence counts" },
  { role: "plan", label: "Plan", group: "account", synonyms: /^(plan|pricing_?plan|subscription|package)$/i, usedFor: "Customer impact" },
  { role: "tenure", label: "Tenure (months)", group: "account", synonyms: /^(tenure(_?months)?|months_?active|customer_?age)$/i, usedFor: "Context" },
  { role: "usage", label: "Usage level", group: "account", synonyms: /^(usage(_?level)?|engagement|activity_?level)$/i, usedFor: "Context" },
  { role: "escalation", label: "Support escalation", group: "context", synonyms: /^(support_?escalation|escalat(ed|ion))$/i, usedFor: "Severity (supporting)" },
  { role: "release", label: "Release version", group: "context", synonyms: /^(release(_?version)?|app_?version|version|build)$/i, usedFor: "Regression concentration" },
  { role: "date", label: "Date", group: "context", synonyms: /^(date|created(_?at)?|submitted(_?at)?|timestamp|received)$/i, usedFor: "Recency" },
  { role: "source", label: "Source", group: "context", synonyms: /^(source|channel|origin)$/i, usedFor: "Evidence diversity" },
  { role: "resolution", label: "Resolution status", group: "context", synonyms: /^(resolution(_?status)?|status|state)$/i, usedFor: "Context" },
  { role: "action", label: "Action taken", group: "context", synonyms: /^(action(_?taken)?|response_?action)$/i, usedFor: "Context" },
];

export const ROLE_LABEL: Record<FieldRole, string> = Object.fromEntries(ROLE_SPECS.map((s) => [s.role, s.label])) as Record<FieldRole, string>;

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s\-]+/g, "_");

export function detectMapping(columns: string[], rows: Record<string, string>[]): FieldMapping {
  const mapping: FieldMapping = {};
  const taken = new Set<string>();
  for (const spec of ROLE_SPECS) {
    const col = columns.find((c) => !taken.has(c) && spec.synonyms.test(norm(c)));
    if (col) { mapping[spec.role] = col; taken.add(col); }
  }
  // Fallback for the comment: the free-text column with the longest average length.
  if (!mapping.comment) {
    let best: string | undefined; let bestLen = 0;
    for (const c of columns) {
      if (taken.has(c)) continue;
      const vals = rows.map((r) => r[c] ?? "").filter(Boolean);
      const avg = vals.reduce((a, v) => a + v.length, 0) / Math.max(vals.length, 1);
      const numeric = vals.every((v) => !isNaN(Number(v)));
      if (!numeric && avg > bestLen && avg > 20) { best = c; bestLen = avg; }
    }
    if (best) mapping.comment = best;
  }
  return mapping;
}
