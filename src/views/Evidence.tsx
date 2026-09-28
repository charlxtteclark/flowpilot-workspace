import React, { useMemo, useState } from "react";
import { useWs } from "../state";
import type { FeedbackRecord } from "../lib/types";
import { Card, Icon, Meter, PriorityPill, ReviewBadge, SectionTitle } from "../components/ui";
import { DecisionStrip, ReviewControls } from "../components/Review";
import { applyFilters } from "../lib/analysis/pipeline";
import { money } from "../lib/analysis/prioritize";

function Meta({ r }: { r: FeedbackRecord }) {
  const items: [string, string][] = [];
  if (r.rating != null) items.push(["Rating", `${r.rating}`]);
  if (r.segment) items.push(["Segment", r.segment]);
  if (r.area) items.push(["Area", r.area]);
  if (r.canceled != null) items.push(["Canceled", r.canceled ? "Yes" : "No"]);
  if (r.churnRisk) items.push(["Churn risk", r.churnRisk]);
  if (r.acv != null) items.push(["ACV", money(r.acv)]);
  if (r.plan) items.push(["Plan", r.plan]);
  if (r.outcome) items.push(["Outcome", r.outcome]);
  if (r.source) items.push(["Source", r.source.replace(/_/g, " ")]);
  if (r.release) items.push(["Release", r.release]);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink3">
      <span className="font-mono text-ink2">{r.id}</span>
      {r.account && <span className="font-mono">{r.account}</span>}
      {r.date && <span className="tnum">{r.date}</span>}
      {items.map(([k, v]) => <span key={k}><span className="text-ink3">{k}</span> <span className={`font-medium ${k === "Canceled" && v === "Yes" ? "text-crit" : "text-ink2"}`}>{v}</span></span>)}
    </div>
  );
}

function Quote({ r }: { r: FeedbackRecord }) {
  return (
    <figure className="rounded-lg border border-line bg-surface p-3.5" data-testid="verbatim" data-id={r.id}>
      <blockquote className="flex gap-2 text-[14px] leading-relaxed"><Icon name="quote" className="mt-1 shrink-0 text-ink3" /><span>“{r.text}”</span></blockquote>
      <figcaption className="mt-2 pl-6"><Meta r={r} /></figcaption>
    </figure>
  );
}

function IssueEvidence() {
  const { issues, selected, select, ds } = useWs();
  const issue = issues.find((i) => i.key === selected) ?? issues[0];
  const byId = useMemo(() => new Map(ds?.records.map((r) => [r.id, r]) ?? []), [ds]);
  if (!issue) return <Card className="p-6 text-ink2">No issues in the current filter.</Card>;
  const recs = issue.ids.map((id) => byId.get(id)!).filter(Boolean);
  const quotes = issue.quoteIds.map((id) => byId.get(id)!).filter(Boolean);
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <nav aria-label="Issues" className="flex flex-col gap-1 lg:sticky lg:top-[64px] lg:self-start">
        {issues.map((i) => (
          <button key={i.key} onClick={() => select(i.key, false)} aria-current={i.key === issue.key}
            className={`flex items-start gap-2 rounded-md px-2.5 py-2 text-left ${i.key === issue.key ? "bg-surface shadow-sm ring-1 ring-line" : "hover:bg-surface2"}`}>
            <PriorityPill p={i.finalPriority} size="sm" />
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{i.finalName}</span><span className="text-2xs text-ink3 tnum">{i.metrics.count} comments</span></span>
            {i.reviewState !== "system" && <Icon name="user" size={12} className="mt-1 text-human" />}
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2"><PriorityPill p={issue.finalPriority} /><ReviewBadge state={issue.reviewState} when={issue.decision?.updatedAt} /><span className="text-xs text-ink3">{issue.finalArea}</span></div>
          <h2 className="mt-2 text-[21px] font-semibold tracking-[-0.01em]" data-testid="evidence-title">{issue.finalName}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div><div className="eyebrow">Why this matters</div><p className="mt-1 text-[14px]">{issue.whyItMatters}</p></div>
            <div><div className="eyebrow">Why it is ranked {issue.priority}</div><p className="mt-1 text-[13px] text-ink2">{issue.rationale}</p></div>
          </div>
          <div className="mt-4 rounded-md border border-accent/30 bg-accentsoft/50 p-3"><span className="eyebrow !text-accent">What to investigate next</span><p className="mt-1 text-[13.5px]">{issue.investigateNext}</p></div>
        </Card>

        <section aria-label="Signals" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {issue.signals.map((s) => (
            <div key={s.key} className="card p-3">
              <div className="flex items-center justify-between gap-2"><span className="eyebrow">{s.label}</span><Meter g={s.grade} /></div>
              <div className="mt-1.5 text-[14px] font-semibold tnum">{s.value}</div>
              <p className="mt-1 text-2xs leading-snug text-ink3">{s.detail}</p>
            </div>
          ))}
        </section>
        {issue.concentration.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs"><span className="eyebrow">Concentration</span>{issue.concentration.map((c) => <span key={c} className="rounded-full bg-surface2 px-2 py-0.5 text-ink2">{c}</span>)}</div>
        )}

        <section className="flex flex-col gap-2">
          <SectionTitle title="Evidence" sub={`Representative verbatims, quoted exactly from the dataset (${quotes.length} of ${recs.length} comments). Chosen to cover canceled accounts, lowest ratings and different segments.`} />
          <div className="grid gap-2 xl:grid-cols-2">{quotes.map((r) => <Quote key={r.id} r={r} />)}</div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle title="Review" />
          <DecisionStrip issue={issue} />
          <ReviewControls issue={issue} />
        </section>

        <Card className="p-0">
          <div className="px-5 pb-1 pt-4"><SectionTitle title={`All ${recs.length} comments in this issue`} sub="Source rows behind every metric above." /></div>
          <CommentTable rows={recs} />
        </Card>
      </div>
    </div>
  );
}

function CommentTable({ rows, issueOf }: { rows: FeedbackRecord[]; issueOf?: Map<string, string> }) {
  const has = (f: (r: FeedbackRecord) => unknown) => rows.some((r) => f(r) != null && f(r) !== "");
  const cols: { h: string; f: (r: FeedbackRecord) => React.ReactNode; show: boolean; cls?: string }[] = [
    { h: "ID", f: (r) => <span className="font-mono text-xs">{r.id}</span>, show: true },
    { h: "Comment", f: (r) => <span className="block min-w-[280px] max-w-[60ch]">{r.text}</span>, show: true },
    { h: "Rating", f: (r) => r.rating ?? "—", show: has((r) => r.rating), cls: "tnum text-right" },
    { h: "Segment", f: (r) => r.segment ?? "—", show: has((r) => r.segment) },
    { h: "Area", f: (r) => r.area ?? "—", show: has((r) => r.area) },
    { h: "Canceled", f: (r) => (r.canceled == null ? "—" : r.canceled ? <span className="font-medium text-crit">Yes</span> : "No"), show: has((r) => r.canceled) },
    { h: "Churn risk", f: (r) => r.churnRisk ?? "—", show: has((r) => r.churnRisk) },
    { h: "ACV", f: (r) => (r.acv != null ? money(r.acv) : "—"), show: has((r) => r.acv), cls: "tnum text-right" },
    { h: "Account", f: (r) => <span className="font-mono text-xs">{r.account ?? "—"}</span>, show: has((r) => r.account) },
    { h: "Date", f: (r) => r.date ?? "—", show: has((r) => r.date), cls: "tnum whitespace-nowrap" },
    { h: "Type", f: (r) => <span title={r.polarityReason} className={r.polarity === "praise" ? "text-human" : ""}>{r.polarity === "praise" ? "Praise" : "Problem"}</span>, show: true },
    { h: "Issue", f: (r) => issueOf?.get(r.id) ?? (r.polarity === "praise" ? "—" : "Unassigned"), show: !!issueOf },
  ];
  const vis = cols.filter((c) => c.show);
  return (
    <div className="scroll-x">
      <table className="data min-w-[900px]" data-testid="comment-table">
        <thead><tr>{vis.map((c) => <th key={c.h} className={c.cls?.includes("text-right") ? "text-right" : ""}>{c.h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}>{vis.map((c) => <td key={c.h} className={`text-[13px] ${c.cls ?? ""}`}>{c.f(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function RawData() {
  const { ds, filters, allIssues } = useWs();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);
  const issueOf = useMemo(() => { const m = new Map<string, string>(); allIssues.forEach((i) => i.ids.forEach((id) => m.set(id, i.finalName))); return m; }, [allIssues]);
  if (!ds) return null;
  const scoped = applyFilters(ds.records, filters);
  const needle = q.trim().toLowerCase();
  const rows = needle ? scoped.filter((r) => Object.values(r.raw).some((v) => v.toLowerCase().includes(needle)) || (issueOf.get(r.id) ?? "").toLowerCase().includes(needle)) : scoped;
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-2 pt-4">
        <SectionTitle title="Full dataset" sub={`${rows.length} of ${ds.records.length} rows (current filters${needle ? " and search" : ""}). Hover a Type value to see why it was classed as a problem or praise.`} />
        <input id="raw-search" type="search" className="input w-64 max-w-full" placeholder="Search comments, ids, accounts…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <CommentTable rows={rows.slice(0, limit)} issueOf={issueOf} />
      {rows.length > limit && <div className="p-3 text-center"><button className="btn" onClick={() => setLimit((l) => l + 200)}>Show more rows</button></div>}
    </Card>
  );
}

export default function Evidence() {
  const [tab, setTab] = useState<"issue" | "raw">("issue");
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle eyebrow="Step 4 · Review evidence" title="Evidence" sub="Recommendation → rationale → metrics → verbatims → raw data. Every quote is an exact source row." right={
        <div className="inline-flex rounded-md border border-line bg-surface p-0.5" role="tablist">
          {([["issue", "By issue"], ["raw", "Full dataset"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded px-3 py-1 text-xs font-medium ${tab === k ? "bg-accentsoft text-accent" : "text-ink2 hover:bg-surface2"}`}>{l}</button>
          ))}
        </div>
      } />
      {tab === "issue" ? <IssueEvidence /> : <RawData />}
    </div>
  );
}
