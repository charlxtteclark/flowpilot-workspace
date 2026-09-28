// 3. Issue identification — a transparent theme lexicon for SaaS feedback.
// Each theme names the problem, says how to describe it, and proposes a research
// question built only from terms that actually appear in the matched comments.

export interface ThemeContext {
  texts: string[];          // comment texts in the issue
  n: number;
  topSegment?: { name: string; share: number };
  cancellations?: number | null;
  release?: { name: string; share: number };
  freePlanShare?: number | null;
}

export interface Theme {
  id: string;
  pattern: RegExp;          // global, case-insensitive
  name: (c: ThemeContext) => string;
  problem: (c: ThemeContext) => string;
  investigate: (c: ThemeContext) => string;
}

const any = (texts: string[], re: RegExp) => texts.filter((t) => re.test(t)).length;
const ENTITIES = ["Salesforce", "HubSpot", "Slack", "Jira", "Zapier", "Google", "Microsoft", "Stripe", "QuickBooks"];
function entity(texts: string[]): string | undefined {
  let best: string | undefined; let n = 0;
  for (const e of ENTITIES) {
    const k = any(texts, new RegExp(`\\b${e}\\b`, "i"));
    if (k > n) { best = e; n = k; }
  }
  return best && n >= Math.max(2, texts.length * 0.3) ? best : undefined;
}
/** Keep only the candidate phrases whose trigger appears in the comments. */
function present(texts: string[], candidates: [RegExp, string][]): string[] {
  return candidates.filter(([re]) => any(texts, re) > 0).map(([, label]) => label);
}
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
const seg = (c: ThemeContext) => (c.topSegment && c.topSegment.share >= 0.5 ? `${c.topSegment.name} ` : "");

export const THEMES: Theme[] = [
  {
    id: "integration_sync",
    pattern: /\b(salesforce|hubspot|sync(s|ed|ing)?|integration|connector|connection|api)\b/gi,
    name: (c) => `${entity(c.texts) ?? "Integration"} integration reliability`,
    problem: (c) => `Customers report that ${entity(c.texts) ?? "integration"} data does not sync reliably, so they stop trusting the reports and workflows built on it.`,
    investigate: (c) => {
      const causes = present(c.texts, [
        [/drop|reconnect|connection/i, "connection drops that need an admin to reconnect"],
        [/late|hours|delay/i, "delayed records"],
        [/skip|missing|not reflected|do not match|don't match/i, "skipped or mismatched records"],
        [/duplicate/i, "duplicate records"],
      ]);
      const why = c.cancellations ? ` and how they relate to the ${c.cancellations} cancellation${c.cancellations === 1 ? "" : "s"} in this group` : "";
      return `Investigate whether the sync failures share one root cause${causes.length ? ` (${list(causes)})` : ""}${why}.`;
    },
  },
  {
    id: "login_auth",
    pattern: /\b(log ?in|login|sign ?in|session|face ?id|password|sso|authenticat\w*|log(ged)? out)\b/gi,
    name: (c) => (any(c.texts, /mobile|ios|android|app\b/i) >= c.n * 0.5 ? "Mobile login failures" : "Login and authentication failures"),
    problem: (c) => `Users cannot reliably sign in${any(c.texts, /mobile|ios|android/i) ? " on mobile" : ""}${c.release && c.release.share >= 0.75 ? `, and the reports cluster on release ${c.release.name}` : ""}.`,
    investigate: (c) => {
      const plats = present(c.texts, [[/\bios\b|face ?id/i, "iOS"], [/android/i, "Android"]]);
      const rel = c.release && c.release.share >= 0.75 ? `began with release ${c.release.name}` : "share a recent trigger";
      return `Confirm whether the login failures ${rel}${plats.length > 1 ? ` and whether ${list(plats).replace(" or ", " and ")} fail for the same reason` : ""}, and measure how many active users are locked out.`;
    },
  },
  {
    id: "permissions",
    pattern: /\b(permission\w*|access|admin\w*|role(-| )?based|roles?|audit|security|approval\w*|compliance|contractors?|external collaborators?)\b/gi,
    name: () => "Permissions and admin controls",
    problem: (c) => `${seg(c) ? seg(c).trim() + " customers" : "Customers"} say access controls are too basic for their organization, which blocks security reviews or wider rollout.`,
    investigate: (c) => {
      const asks = present(c.texts, [
        [/role/i, "role-based permissions"], [/audit/i, "audit logs"], [/approval|external/i, "approval controls for external collaborators"],
        [/view|edit|export/i, "separate view/edit/export rights"], [/contractor|should not have access/i, "fixing over-broad access"],
      ]);
      return `Identify which controls${asks.length ? ` (${list(asks)})` : ""} are hard blockers for expansion or security review, and which accounts are waiting on each.`;
    },
  },
  {
    id: "performance",
    pattern: /\b(slow\w*|load(s|ing)?|sluggish|time(s)? ?out|freez\w*|lag\w*|performance|speed|degrad\w*|takes? too long)\b/gi,
    name: (c) => (any(c.texts, /large|grow|largest|scale|six months|several/i) >= 2 ? "Performance at scale" : "Performance and speed"),
    problem: (c) => `The product slows down${any(c.texts, /large|grow|largest/i) ? " as workspaces and projects grow" : ""}, disrupting routine work.`,
    investigate: (c) => {
      const ops = present(c.texts, [[/load/i, "loading"], [/filter/i, "filtering"], [/search/i, "search"], [/export/i, "exports"], [/update|freez/i, "concurrent edits"]]);
      return `Determine the workspace size or data volume at which performance degrades${ops.length ? `, and which operations (${ops.join(", ")}) are slowest` : ""}.`;
    },
  },
  {
    id: "billing",
    pattern: /\b(bill\w*|invoice\w*|charg\w*|pric\w*|refund\w*|payment\w*|purchase order|seat)\b/gi,
    name: () => "Billing and invoicing",
    problem: () => "Customers hit billing errors or unclear pricing and invoices.",
    investigate: (c) => {
      const errors = any(c.texts, /charged|wrong|error|surprised/i);
      const clarity = any(c.texts, /explain|clear|confus|purchase order|consolidated/i);
      return `Separate billing errors (${errors} comment${errors === 1 ? "" : "s"}) from clarity or invoicing gaps (${clarity}), and check whether either affects renewals.`;
    },
  },
  {
    id: "dashboard_custom",
    pattern: /\b(dashboards?|layouts?|colou?rs?|themes?|widgets?|customi[sz]\w*|dark mode|fonts?|rearrang\w*|palettes?|polished|rigid|home screen|cards)\b/gi,
    name: () => "Dashboard customization",
    problem: () => "Users want more control over how dashboards look and are arranged.",
    investigate: (c) => {
      const free = c.freePlanShare != null && c.freePlanShare >= 0.5 ? ` Most requests come from Free-plan accounts, so check whether customization would drive upgrades.` : "";
      return `Check whether customization requests are tied to adoption, upgrade or retention decisions, or are nice-to-haves.${free}`;
    },
  },
  {
    id: "reporting_guidance",
    pattern: /\b(report\w*|metrics?|kpis?|measures?|templates?|leadership|board|charts?|executive|project health)\b/gi,
    name: (c) => (any(c.texts, /which|what needs|where to start|not sure|choosing|recommend|deciding/i) >= Math.max(2, c.n * 0.3) ? "Reporting guidance: which metrics matter" : "Reporting and templates"),
    problem: () => "Users can build reports but are unsure which metrics and views matter to their stakeholders.",
    investigate: (c) => {
      const guidance = any(c.texts, /which|what needs|where to start|not sure|choosing|recommend|deciding/i);
      return `Explore whether users need more templates or guidance on what to measure${guidance ? ` (${guidance} of ${c.n} comments point to choosing the right metrics)` : ""}.`;
    },
  },
  {
    id: "onboarding",
    pattern: /\b(set ?up|onboard\w*|tutorial|getting started|invit\w*|first (data source|workflow)|checklist|demo|required|optional)\b/gi,
    name: () => "Setup and onboarding friction",
    problem: () => "New customers get stuck in specific setup steps.",
    investigate: (c) => {
      const steps = present(c.texts, [[/data source|connect/i, "connecting data"], [/required|optional/i, "required vs. optional steps"], [/invit/i, "inviting teammates"], [/tutorial|assumes/i, "tutorial assumptions"]]);
      return `Find which setup steps cause drop-off${steps.length ? ` (${steps.join(", ")})` : ""} and how often new accounts stall there.`;
    },
  },
];

export const GENERIC_THEME: Theme = {
  id: "general",
  pattern: /$^/g,
  name: () => "Other feedback",
  problem: (c) => `${c.n} comments describe problems that do not match a common theme.`,
  investigate: (c) => `Interview a sample of the ${c.n} affected accounts to establish how often this happens, what it blocks, and whether it affects renewal.`,
};

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? GENERIC_THEME;
}

/** Score each theme by keyword hits; ties resolve in lexicon order. */
export function bestTheme(text: string): { id: string; hits: number } {
  let best = { id: GENERIC_THEME.id, hits: 0 };
  for (const t of THEMES) {
    const hits = (text.match(t.pattern) ?? []).length;
    if (hits > best.hits) best = { id: t.id, hits };
  }
  return best;
}
