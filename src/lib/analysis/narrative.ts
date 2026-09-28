// Explanations for each issue, generated only from computed metrics and signals.
import type { FeedbackRecord, IssueMetrics, Priority, Signal } from "../types";
import type { Graded, ScopeContext } from "./prioritize";
import { money, pct, r1 } from "./prioritize";

const sig = (ss: Signal[], k: Signal["key"]) => ss.find((s) => s.key === k)!;

function phrase(s: Signal, m: IssueMetrics, g: Graded, sc: ScopeContext): string {
  const n = m.count;
  switch (s.key) {
    case "frequency":
      return s.grade === "High" ? `it is one of the most mentioned problems (${n} comments, ${pct(m.share)})`
        : s.grade === "Medium" ? `it comes up moderately often (${n} comments, ${pct(m.share)})`
        : `it is mentioned less often (${n} comment${n === 1 ? "" : "s"})`;
    case "severity": {
      const esc = m.escalations ? `; ${m.escalations} of ${n} escalated` : "";
      return s.grade === "High" ? `experiences are severe (avg rating ${s.value}${esc})`
        : s.grade === "Medium" ? `ratings are moderately negative (avg ${s.value}${esc})`
        : `ratings are mild (avg ${s.value})`;
    }
    case "customer": {
      if (s.grade === "High") {
        if (sc.topValueSegment && g.topSegShare >= 0.5) return `it is concentrated in ${sc.topValueSegment} accounts (${pct(g.topSegShare)}${m.medianAcv != null ? `, median ACV ${money(m.medianAcv)}` : ""})`;
        return `affected accounts carry top-quartile contract value (median ACV ${money(m.medianAcv ?? 0)})`;
      }
      if (s.grade === "Medium") return g.paidShare != null && g.paidShare >= 0.5 ? `${pct(g.paidShare)} of affected accounts are paying customers` : `${pct(g.topSegShare)} of comments come from ${sc.topValueSegment} accounts`;
      const free = m.plans.length === 1 && /free/i.test(m.plans[0].name);
      return free ? `every affected account is on the ${m.plans[0].name} plan${m.acvExposure === 0 ? " with $0 ACV" : ""}` : `few affected accounts are high-value`;
    }
    case "business": {
      if (s.grade === "High") {
        const bits: string[] = [];
        if (m.cancellations) bits.push(`${m.cancellations} cancellation${m.cancellations === 1 ? "" : "s"}`);
        if (m.highChurn) bits.push(`${m.highChurn} of ${n} flagged high churn risk`);
        return `it carries a strong churn signal (${bits.join("; ")})`;
      }
      if (s.grade === "Medium") {
        const bits: string[] = [];
        if (m.cancellations) bits.push(`${m.cancellations} cancellation`);
        if (m.highChurn) bits.push(`${m.highChurn} high churn risk`);
        if (m.mediumChurn) bits.push(`${m.mediumChurn} medium churn risk`);
        for (const o of m.negativeOutcomes) bits.push(`"${o.label}" ×${o.count}`);
        return `there are early business signals (${bits.join(", ")})`;
      }
      return `there are no cancellations or high churn-risk flags`;
    }
    case "evidence":
      return s.grade === "Low" ? `only ${g.independent} independent source${g.independent === 1 ? "" : "s"} support${g.independent === 1 ? "s" : ""} it` : `${g.independent} independent ${m.uniqueAccounts != null ? "accounts" : "comments"} support it`;
  }
}

const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function rationale(priority: Priority, m: IssueMetrics, g: Graded, sc: ScopeContext, conc: string[] = []): string {
  const ss = g.signals.filter((s) => s.grade !== "N/A");
  const order: Signal["key"][] = ["business", "severity", "customer", "frequency", "evidence"];
  const byKey = (a: Signal, b: Signal) => order.indexOf(a.key) - order.indexOf(b.key);
  const up = ss.filter((s) => s.grade === "High" && s.key !== "evidence").sort(byKey);
  const mid = ss.filter((s) => s.grade === "Medium" && s.key !== "evidence" && s.key !== "frequency").sort(byKey);
  const down = ss.filter((s) => s.grade === "Low" && s.key !== "evidence").sort(byKey);
  const ev = sig(g.signals, "evidence");
  const missing = g.signals.filter((s) => s.grade === "N/A").map((s) => s.label.toLowerCase());
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const P = (s: Signal) => phrase(s, m, g, sc);
  const freq = sig(g.signals, "frequency");
  let out: string;
  if (priority === "Lower" && freq.grade === "High") {
    out = `Mentioned often (${m.count} comments), but ${joinList(down.filter((s) => s.key !== "frequency").map(P)) || "the other signals are weak"}.`;
  } else if (priority === "High") {
    const drivers = [...up, ...mid].slice(0, 3);
    out = `${cap(joinList(drivers.map(P)))}.`;
    if (down.length) out += ` On the other hand, ${joinList(down.map(P))}.`;
  } else {
    const pos = [...up, ...mid, ...(freq.grade === "Medium" ? [freq] : [])].slice(0, 2).map(P);
    out = pos.length ? `${cap(joinList(pos))}.` : "";
    if (down.length) out += `${out ? " " : ""}Held back because ${joinList(down.slice(0, 2).map(P))}.`;
  }
  const rel = conc.find((c) => /release/.test(c));
  if (rel) out += ` ${rel.replace(/^All/, "All")} — the timing points to a possible regression.`;
  if (ev.grade === "Low") out += ` Evidence is thin: ${P(ev)}.`;
  else out += ` Supported by ${g.independent} independent ${m.uniqueAccounts != null ? "accounts" : "comments"}.`;
  if (g.cap) out += ` ${g.cap}`;
  if (missing.length) out += ` Not scored: ${joinList(missing)} (not in the data).`;
  return out.trim();
}

export function whyItMatters(m: IssueMetrics, g: Graded, sc: ScopeContext): string {
  const n = m.count;
  const parts: string[] = [];
  const bus = sig(g.signals, "business");
  if (bus.grade === "N/A") parts.push("The dataset has no cancellation, churn-risk or outcome fields, so business impact can't be assessed from it.");
  else if (m.cancellations) parts.push(`${m.cancellations} of ${n} comments come from accounts that canceled${m.highChurn ? `, and ${m.highChurn} of ${n} are flagged high churn risk` : ""}.`);
  else if (m.highChurn) parts.push(`${m.highChurn} of ${n} comment${n === 1 ? "" : "s"} ${m.highChurn === 1 ? "comes" : "come"} from ${m.highChurn === 1 ? "an account" : "accounts"} flagged high churn risk; none has canceled${m.mediumChurn ? `, and ${m.mediumChurn} more are medium risk` : ""}.`);
  else if (m.negativeOutcomes.length) parts.push(`No cancellations, but outcomes include ${m.negativeOutcomes.map((o) => `"${o.label}" (${o.count})`).join(" and ")}.`);
  else parts.push(`No cancellations or high churn-risk flags are attached to these ${n} comments.`);

  if (m.acvExposure != null && m.acvExposure > 0) parts.push(`Affected accounts represent ${money(m.acvExposure)} in annual contract value${sc.topValueSegment && g.topSegShare >= 0.5 ? `, mostly ${sc.topValueSegment}` : ""}.`);
  else if (m.acvExposure === 0) parts.push("Affected accounts carry $0 in annual contract value.");
  const sev = sig(g.signals, "severity");
  if (sev.grade === "High") parts.push(`Ratings average ${sev.value}.`);
  return parts.slice(0, 2).join(" ");
}

export function customerImpact(m: IssueMetrics): string {
  const segs = m.segments.map((s) => `${s.name} (${s.count})`).join(", ");
  const plans = m.plans.map((p) => p.name).join(" / ");
  const acc = m.uniqueAccounts != null ? `${m.uniqueAccounts} account${m.uniqueAccounts === 1 ? "" : "s"}` : "";
  const bits = [segs, plans ? `${plans} plan${m.plans.length > 1 ? "s" : ""}` : "", acc].filter(Boolean);
  return bits.length ? bits.join(" · ") : "Not available (no segment, plan or account fields)";
}

export function businessSignal(m: IssueMetrics, avail: ScopeContext["avail"]): string {
  if (!avail.canceled && !avail.churnRisk && !avail.outcome && !avail.acv) {
    return `Not available in this dataset${m.cancelMentions ? ` (${m.cancelMentions} comment${m.cancelMentions === 1 ? "" : "s"} mention canceling in the text; not verified by account data)` : ""}`;
  }
  const bits: string[] = [];
  if (m.cancellations != null) bits.push(`${m.cancellations} canceled`);
  if (m.highChurn != null) bits.push(`${m.highChurn} high / ${m.mediumChurn ?? 0} medium churn risk`);
  if (m.acvExposure != null) bits.push(`${money(m.acvExposure)} ACV exposure`);
  for (const o of m.negativeOutcomes) bits.push(`${o.label} ×${o.count}`);
  return bits.join(" · ");
}

export function concentration(m: IssueMetrics, recs: FeedbackRecord[], sc: ScopeContext): string[] {
  const out: string[] = [];
  const n = m.count;
  const top = m.segments[0];
  if (top && m.segments.length >= 1 && top.count / n >= 0.6) out.push(`${pct(top.count / n)} ${top.name}`);
  const rel = m.releases[0];
  if (rel && sc.releasesInScope > 1 && rel.count / n >= 0.75) out.push(`${rel.count === n ? `All ${n}` : `${rel.count} of ${n}`} on release ${rel.name}`);
  const plan = m.plans[0];
  if (plan && plan.count / n >= 0.8 && m.plans.length === 1) out.push(`All on ${plan.name} plan`);
  if (m.dateRange && m.dateRange[0] !== m.dateRange[1]) out.push(`${m.dateRange[0]} → ${m.dateRange[1]}`);
  void recs;
  return out;
}

export { r1 };
