import React from "react";
import { useWs } from "../state";
import type { ReviewedIssue } from "../lib/review/decisions";
import { Card, Icon, Meter, PriorityPill, ReviewBadge, SectionTitle, fmtRating } from "../components/ui";
import { FieldsUsed, QualityPanel } from "../components/Review";
import { RankSlope } from "../components/charts";
import { ScopeNote } from "../components/Shell";
import { money } from "../lib/analysis/prioritize";

export function Progression() {
  const { sampleId, loadSample } = useWs();
  const steps = [
    { tag: "Build #0", title: "Better prompt + richer metadata", body: "A prioritization prompt, plus rating, segment and cancellation fields." },
    { tag: "Build #1", title: "Repeatable workspace", body: "Saved instructions and data mapping, re-run on any new export." },
    { tag: "This application", title: "Decision-ready workflow", body: "Ranked problems, traceable evidence, human review and history." },
  ];
  return (
    <div className="card overflow-hidden">
      <ol className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {steps.map((s, i) => (
          <li key={s.tag} className={`flex gap-3 px-4 py-3 ${i === 2 ? "bg-accentsoft" : ""}`}>
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-2xs font-semibold ${i === 2 ? "bg-accent text-surface" : "bg-surface2 text-ink2"}`}>{i === 2 ? <Icon name="check" size={11} /> : i}</span>
            <div className="min-w-0">
              <div className={`text-2xs font-semibold uppercase tracking-[0.06em] ${i === 2 ? "text-accent" : "text-ink3"}`}>{s.tag}</div>
              <div className="text-[13px] font-semibold">{s.title}</div>
              <div className="text-xs text-ink2">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-ink2">
        <span className="flex flex-wrap items-center gap-1.5">
          {["Customer feedback", "Prioritized problems", "Evidence", "Human review", "Reusable product insight"].map((x, i, a) => (
            <React.Fragment key={x}><span className={i === a.length - 1 ? "font-semibold text-ink" : ""}>{x}</span>{i < a.length - 1 && <Icon name="arrow" size={12} className="text-ink3" />}</React.Fragment>
          ))}
        </span>
        {sampleId === "commentsOnly"
          ? <button className="font-medium text-accent hover:underline" onClick={() => loadSample("full")}>Back to the full dataset</button>
          : <button className="font-medium text-accent hover:underline" onClick={() => loadSample("commentsOnly")} title="Load the same comments without metadata">Compare: comments only, no metadata</button>}
      </div>
    </div>
  );
}

function RecCard({ issue, rank }: { issue: ReviewedIssue; rank: number }) {
  const { select } = useWs();
  const m = issue.metrics;
  return (
    <Card as="article" className="p-0">
      <div className="grid gap-0 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-ink3 tnum">{rank}.</span>
            <PriorityPill p={issue.finalPriority} />
            {issue.finalPriority !== issue.priority && <span className="text-2xs text-ink3">system said <PriorityPill p={issue.priority} size="sm" strike /></span>}
            <ReviewBadge state={issue.reviewState} when={issue.decision?.updatedAt} />
          </div>
          <div>
            <h3 className="text-[19px] font-semibold leading-snug tracking-[-0.01em]">{issue.finalName}</h3>
            <div className="mt-0.5 text-xs text-ink3">{issue.finalArea} · {m.count} comments · Avg rating {fmtRating(m.avgRating, m.ratingMax)}{m.cancellations != null ? ` · ${m.cancellations} cancellation${m.cancellations === 1 ? "" : "s"}` : ""}</div>
          </div>
          <dl className="flex flex-col gap-2.5 text-[13.5px]">
            <div><dt className="eyebrow">Problem</dt><dd className="mt-0.5">{issue.problem}{issue.aiDrafted && <span className="ml-1 text-2xs text-ink3">(drafted by Claude)</span>}</dd></div>
            <div><dt className="eyebrow">Why it matters</dt><dd className="mt-0.5">{issue.whyItMatters}</dd></div>
          </dl>
          {issue.decision?.note && <p className="rounded-md bg-humansoft px-3 py-2 text-[13px]"><span className="font-semibold text-human">Reviewer note:</span> {issue.decision.note}</p>}
        </div>
        <div className="flex flex-col gap-3 border-t border-line bg-surface2/60 p-5 lg:border-l lg:border-t-0">
          <dl className="grid gap-2.5 text-[13px]">
            <div><dt className="eyebrow">Evidence</dt><dd className="mt-0.5">{m.count} comments from {m.uniqueAccounts ?? "—"} accounts · avg {fmtRating(m.avgRating, m.ratingMax)}{m.escalations != null ? ` · ${m.escalations} escalated` : ""} · {issue.confidence} confidence</dd></div>
            <div><dt className="eyebrow">Customer impact</dt><dd className="mt-0.5">{issue.customerImpact}</dd></div>
            <div><dt className="eyebrow">Business signal</dt><dd className="mt-0.5">{issue.businessSignal}</dd></div>
          </dl>
          <div className="rounded-md border border-accent/30 bg-surface p-3">
            <div className="eyebrow !text-accent">What to investigate next</div>
            <p className="mt-1 text-[13.5px]">{issue.investigateNext}</p>
          </div>
          <button className="btn self-start" onClick={() => select(issue.key)}>Review evidence<Icon name="arrow" size={14} /></button>
        </div>
      </div>
    </Card>
  );
}

export function PriorityTable({ issues }: { issues: ReviewedIssue[] }) {
  const { select } = useWs();
  return (
    <div className="scroll-x">
      <table className="data min-w-[980px]" data-testid="priority-table">
        <thead>
          <tr><th>#</th><th>Priority</th><th>Issue</th><th className="text-right">Comments</th><th className="text-right">Avg rating</th><th>Severity</th><th>Segments</th><th>Cancel / churn</th><th>Business</th><th>Confidence</th><th>Review</th></tr>
        </thead>
        <tbody>
          {issues.map((i, k) => {
            const sev = i.signals.find((s) => s.key === "severity")!;
            const bus = i.signals.find((s) => s.key === "business")!;
            const m = i.metrics;
            return (
              <tr key={i.key} className="cursor-pointer hover:bg-surface2" onClick={() => select(i.key)}>
                <td className="tnum text-ink3">{k + 1}</td>
                <td><div className="flex flex-col items-start gap-1"><PriorityPill p={i.finalPriority} size="sm" />{i.finalPriority !== i.priority && <span className="text-2xs text-ink3">sys: {i.priority}</span>}</div></td>
                <td className="min-w-[260px]">
                  <div className="font-medium">{i.finalName}</div>
                  <div className="text-xs text-ink3">{i.finalArea}</div>
                  <p className="mt-1 max-w-[52ch] text-xs text-ink2">{i.rationale}</p>
                </td>
                <td className="text-right tnum">{m.count}</td>
                <td className="text-right tnum">{fmtRating(m.avgRating, m.ratingMax)}</td>
                <td><Meter g={sev.grade} /></td>
                <td className="text-xs text-ink2">{m.segments.length ? m.segments.map((s) => `${s.name} ${s.count}`).join(", ") : "—"}</td>
                <td className="text-xs tnum">{m.cancellations != null ? `${m.cancellations} canceled` : "—"}{m.highChurn != null ? <div className="text-ink3">{m.highChurn} high risk</div> : null}</td>
                <td><Meter g={bus.grade} />{m.acvExposure != null && m.acvExposure > 0 && <div className="text-2xs text-ink3 tnum">{money(m.acvExposure)} ACV</div>}</td>
                <td className="text-xs">{i.confidence}</td>
                <td><ReviewBadge state={i.reviewState} when={i.decision?.updatedAt} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FrequencyVsPriority() {
  const { allIssues, select } = useWs();
  if (allIssues.length < 2) return null;
  const byFreq = [...allIssues].sort((a, b) => a.freqRank - b.freqRank);
  const byPri = [...allIssues].sort((a, b) => a.priorityRank - b.priorityRank);
  const f = byFreq[0]; const p = byPri[0];
  let claim: React.ReactNode;
  if (f.key === p.key) {
    claim = <>In this data, the most frequently mentioned problem, <b>{f.finalName}</b>, is also the top priority, so frequency and priority agree here.</>;
  } else {
    const reasons: string[] = [];
    if (p.metrics.avgRating != null && f.metrics.avgRating != null && p.metrics.avgRating < f.metrics.avgRating - 0.25) reasons.push(`lower ratings (avg ${p.metrics.avgRating.toFixed(1)} vs ${f.metrics.avgRating.toFixed(1)})`);
    if (p.metrics.cancellations != null && f.metrics.cancellations != null && p.metrics.cancellations > f.metrics.cancellations) reasons.push(`${p.metrics.cancellations} cancellation${p.metrics.cancellations === 1 ? "" : "s"} vs ${f.metrics.cancellations}`);
    if (p.metrics.highChurn != null && f.metrics.highChurn != null && p.metrics.highChurn > f.metrics.highChurn) reasons.push(`${p.metrics.highChurn} high churn-risk accounts vs ${f.metrics.highChurn}`);
    if (p.metrics.acvExposure != null && f.metrics.acvExposure != null && p.metrics.acvExposure > f.metrics.acvExposure) reasons.push(`${money(p.metrics.acvExposure)} vs ${money(f.metrics.acvExposure)} in contract value`);
    claim = reasons.length
      ? <><b>{f.finalName}</b> is the most frequently mentioned problem ({f.metrics.count} comments), while <b>{p.finalName}</b> ({p.metrics.count} comments) warrants earlier investigation because of {reasons.slice(0, 3).join(", ")}.</>
      : <><b>{f.finalName}</b> is mentioned most ({f.metrics.count} comments), but <b>{p.finalName}</b> scores higher on the combined signals. The data has no severity or business fields that would explain the difference, so treat this ordering with caution.</>;
  }
  return (
    <Card className="p-5">
      <SectionTitle eyebrow="Most common ≠ most important" title="Frequency vs. Priority" sub={claim} />
      <div className="mt-4"><RankSlope rows={allIssues.map((i) => ({ key: i.key, label: i.finalName, freqRank: i.freqRank, priRank: i.priorityRank, priority: i.priority, count: i.metrics.count }))} onSelect={select} /></div>
      <p className="mt-1 text-2xs text-ink3">Colored lines moved two or more places between the rankings. Right-hand ranks are the system's; reviewer overrides show in the table above.</p>
    </Card>
  );
}

export default function Overview() {
  const { issues, analysis, full, ai } = useWs();
  if (!analysis || !full) return null;
  const recs = issues.filter((i) => i.finalPriority !== "Lower").slice(0, 3);
  const top = recs.length ? recs : issues.slice(0, 3);
  const praise = analysis.praiseByArea;
  return (
    <div className="flex flex-col gap-6">
      <Progression />
      <ScopeNote />
      <SectionTitle
        eyebrow={`${analysis.problemCount} problem comments · ${issues.length} issues · ${ai ? "Claude-assisted grouping" : "rules engine"}`}
        title="What should I investigate first?"
        sub={<>Ranked on five signals — frequency, severity, customer impact, business impact and evidence strength — not on mentions alone. Every number is computed from the dataset; open any issue to see the comments behind it.</>}
      />
      <section aria-labelledby="recs" className="flex flex-col gap-3">
        <h2 id="recs" className="eyebrow">Recommended areas to investigate</h2>
        {top.length ? top.map((i, k) => <RecCard key={i.key} issue={i} rank={k + 1} />) : <Card className="p-6 text-ink2">No problem comments in the current filter.</Card>}
      </section>

      <Card className="p-0">
        <div className="px-5 pb-2 pt-4"><SectionTitle title="All prioritized problems" sub="System recommendation with reviewer decisions applied. Click a row for the evidence." /></div>
        <PriorityTable issues={issues} />
      </Card>

      <FrequencyVsPriority />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle title="What customers value" sub="Praise is kept out of the problem ranking." />
          <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
            {praise.length ? praise.map((p) => <li key={p.area} className="flex justify-between gap-3"><span>{p.area}</span><span className="tnum text-ink2">{p.count}</span></li>) : <li className="text-ink3">No praise in scope.</li>}
          </ul>
          {praise[0] && <p className="mt-3 text-xs text-ink3">{analysis.praiseCount} praise comments in total. Filter by Type → Praise to read them in Evidence.</p>}
        </Card>
        <Card className="p-5"><SectionTitle title="Fields used" /><div className="mt-3"><FieldsUsed dense /></div></Card>
        <Card className="p-5"><SectionTitle title="Analysis quality" sub="Checked before recommendations are shown." /><div className="mt-3"><QualityPanel /></div></Card>
      </div>
    </div>
  );
}
