import React, { useMemo, useRef, useState } from "react";
import { useWs, SAMPLES, type View } from "../state";
import { Icon, MultiSelect, fmtDate } from "./ui";
import { EMPTY_FILTERS } from "../lib/analysis/pipeline";
import type { FeedbackRecord } from "../lib/types";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "problems", label: "Customer Problems", icon: "problems" },
  { id: "evidence", label: "Evidence", icon: "evidence" },
  { id: "insights", label: "Insights", icon: "insights" },
  { id: "history", label: "Review History", icon: "history" },
  { id: "instructions", label: "Analysis Instructions", icon: "instructions" },
];

export function Sidebar() {
  const { view, setView, allIssues, history, store } = useWs();
  const unreviewed = allIssues.filter((i) => i.reviewState === "system").length;
  return (
    <nav aria-label="Workspace" className="lg:sticky lg:top-0 lg:h-screen lg:w-[228px] lg:shrink-0 lg:border-r border-b lg:border-b-0 border-line bg-surface">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 lg:pb-5">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-bg">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 11.5c3-.2 4.8-2.4 6-5.5 1 2.6 2.6 4.3 6 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </span>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-[-0.01em]">FlowPilot</div>
          <div className="text-2xs text-ink3">Customer Feedback Workspace</div>
        </div>
      </div>
      <ul className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:px-2">
        {NAV.map((n) => {
          const on = view === n.id;
          const badge = n.id === "problems" && unreviewed ? unreviewed : n.id === "history" && history.length ? history.length : null;
          return (
            <li key={n.id} className="shrink-0">
              <button onClick={() => setView(n.id)} aria-current={on ? "page" : undefined}
                className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] ${on ? "bg-accentsoft font-semibold text-accent" : "text-ink2 hover:bg-surface2 hover:text-ink"}`}>
                <Icon name={n.icon} />{n.label}
                {badge != null && <span className={`ml-auto rounded px-1.5 text-2xs tnum ${n.id === "problems" ? "bg-warnsoft text-warn" : "bg-surface2 text-ink3"}`} title={n.id === "problems" ? `${badge} issues not yet reviewed` : `${badge} review changes`}>{badge}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto hidden px-4 pb-4 pt-6 text-2xs text-ink3 lg:block">
        <div className="flex items-center gap-1.5"><Icon name="database" size={12} />{store?.kind === "shared" ? "Reviews saved to this workspace, shared with your team" : store ? "Reviews saved in this browser" : "Connecting storage…"}</div>
      </div>
    </nav>
  );
}

export function TopBar() {
  const { datasetLabel, ds, ranAt, full, loadFile, loadSample, rerun, sampleId, setView } = useWs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState(false);
  const passed = full?.checks.filter((c) => c.pass).length ?? 0;
  const total = full?.checks.length ?? 0;
  return (
    <header className="z-20 lg:sticky lg:top-0 border-b border-line bg-bg/95 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 lg:px-8">
        <dl className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
          <div className="flex min-w-0 gap-1.5"><dt className="text-ink3">Dataset:</dt><dd className="truncate font-medium" data-testid="dataset-name">{datasetLabel}</dd></div>
          <div className="flex gap-1.5"><dt className="text-ink3">Comments:</dt><dd className="font-medium tnum" data-testid="comment-count">{ds?.records.length ?? "—"}</dd></div>
          <div className="flex gap-1.5"><dt className="text-ink3">Last analyzed:</dt><dd className="font-medium tnum">{fmtDate(ranAt ?? undefined)}</dd></div>
          {full && (
            <button onClick={() => setView("insights")} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${passed === total ? "bg-humansoft text-human" : "bg-critsoft text-crit"}`} title="Evidence checks — see Insights">
              <Icon name={passed === total ? "check" : "alert"} size={12} />{passed === total ? "Checks passed" : `${total - passed} check${total - passed === 1 ? "" : "s"} failed`}
            </button>
          )}
        </dl>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input ref={fileRef} id="csv-upload" type="file" accept=".csv,text/csv" className="sr-only" data-testid="csv-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }} />
          <div className="relative">
            <button className="btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}><Icon name="database" />Sample data<Icon name="down" size={12} /></button>
            {menu && (
              <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-line bg-surface p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                {(Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]).map((k) => (
                  <button key={k} className="flex w-full flex-col items-start rounded px-3 py-2 text-left hover:bg-surface2" onClick={() => { loadSample(k); setMenu(false); }}>
                    <span className="flex items-center gap-2 text-[13px] font-medium">{SAMPLES[k].label}{sampleId === k && <Icon name="check" size={12} className="text-human" />}</span>
                    <span className="text-2xs text-ink3">{SAMPLES[k].note}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" />Upload CSV</button>
          <button className="btn btn-primary" onClick={rerun}><Icon name="refresh" />Re-run</button>
        </div>
      </div>
    </header>
  );
}

export function FilterBar() {
  const { ds, filters, setFilters, analysis } = useWs();
  const opts = useMemo(() => {
    if (!ds) return null;
    const count = (f: (r: FeedbackRecord) => string | undefined) => {
      const m = new Map<string, number>();
      for (const r of ds.records) { const k = f(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([value, count]) => ({ value, label: value, count }));
    };
    return {
      areas: count((r) => r.area), segments: count((r) => r.segment), ratings: count((r) => (r.rating != null ? String(r.rating) : undefined)),
      sentiments: count((r) => r.sentiment), hasCanceled: ds.records.some((r) => r.canceled != null),
    };
  }, [ds]);
  if (!ds || !opts) return null;
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-3 lg:px-8" role="group" aria-label="Filters">
      <span className="mr-1 inline-flex items-center gap-1 text-xs text-ink3"><Icon name="filter" size={14} />Filter</span>
      {opts.areas.length > 0 && <MultiSelect id="f-area" label="Product area" options={opts.areas} value={filters.areas} onChange={(v) => setFilters({ ...filters, areas: v })} />}
      {opts.segments.length > 0 && <MultiSelect id="f-seg" label="Segment" options={opts.segments} value={filters.segments} onChange={(v) => setFilters({ ...filters, segments: v })} />}
      {opts.ratings.length > 0 && <MultiSelect id="f-rating" label="Rating" options={opts.ratings.map((o) => ({ ...o, label: `${o.value} ★` }))} value={filters.ratings} onChange={(v) => setFilters({ ...filters, ratings: v })} />}
      {opts.hasCanceled && (
        <select id="f-cancel" aria-label="Cancellation status" className="input !py-1 !text-xs" value={filters.canceled} onChange={(e) => setFilters({ ...filters, canceled: e.target.value as typeof filters.canceled })}>
          <option value="any">Cancellation: any</option><option value="yes">Canceled</option><option value="no">Not canceled</option>
        </select>
      )}
      <MultiSelect id="f-pri" label="Priority" options={["High", "Medium", "Lower"].map((p) => ({ value: p, label: p }))} value={filters.priorities} onChange={(v) => setFilters({ ...filters, priorities: v })} />
      {opts.sentiments.length > 0
        ? <MultiSelect id="f-sent" label="Sentiment" options={opts.sentiments} value={filters.sentiments} onChange={(v) => setFilters({ ...filters, sentiments: v })} />
        : (
          <select id="f-type" aria-label="Feedback type" className="input !py-1 !text-xs" value={filters.polarity} onChange={(e) => setFilters({ ...filters, polarity: e.target.value as typeof filters.polarity })} title="No sentiment column; feedback type is derived from rating and wording">
            <option value="any">Type: all feedback</option><option value="problem">Problems & requests</option><option value="praise">Praise</option>
          </select>
        )}
      {active && (
        <>
          <span className="text-xs text-ink2 tnum" data-testid="scope-count">{analysis?.scopeCount ?? 0} of {ds.records.length} comments</span>
          <button className="text-xs font-medium text-accent hover:underline" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
        </>
      )}
    </div>
  );
}

export function ScopeNote() {
  const { filters, analysis, ds } = useWs();
  if (!analysis || !ds || JSON.stringify(filters) === JSON.stringify(EMPTY_FILTERS)) return null;
  return (
    <div className="rounded-lg border border-accent/30 bg-accentsoft px-3 py-2 text-[13px] text-ink2">
      Filtered view: priorities are recalculated on {analysis.scopeCount} of {ds.records.length} comments, so frequency shares and thresholds refer to this subset.
    </div>
  );
}
export const _r = React;
