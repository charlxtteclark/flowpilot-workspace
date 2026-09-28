import React, { useEffect, useMemo, useState } from "react";
import { useWs } from "../state";
import type { ReviewedIssue } from "../lib/review/decisions";
import { PRIORITIES } from "../lib/review/decisions";
import type { Priority } from "../lib/types";
import { Icon, PriorityPill, ReviewBadge, fmtDate } from "./ui";
import { ROLE_SPECS } from "../lib/ingest/schema";

/** Side-by-side: what the system recommended vs. what the reviewer decided. */
export function DecisionStrip({ issue }: { issue: ReviewedIssue }) {
  const d = issue.decision;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg border border-dashed border-line p-3">
        <div className="eyebrow mb-1.5 flex items-center gap-1"><Icon name="cpu" size={12} />System-generated analysis</div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]"><PriorityPill p={issue.priority} size="sm" /><span className="font-medium">{issue.name}</span><span className="text-ink3">· {issue.area}</span></div>
        <div className="mt-1 text-2xs text-ink3">Score {Math.round(issue.score * 100)} / 100 · {issue.confidence} confidence{issue.aiDrafted ? " · wording drafted by Claude" : ""}</div>
      </div>
      <div className={`rounded-lg p-3 ${d ? "bg-humansoft" : "border border-line bg-surface2"}`}>
        <div className={`eyebrow mb-1.5 flex items-center gap-1 ${d ? "!text-human" : ""}`}><Icon name="user" size={12} />Human-reviewed decision</div>
        {d ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[13px]"><PriorityPill p={issue.finalPriority} size="sm" /><span className="font-medium">{issue.finalName}</span><span className="text-ink3">· {issue.finalArea}</span></div>
            <div className="mt-1 text-2xs text-ink2">{d.status === "approved" ? "Approved as recommended" : "Changed by reviewer"} · {fmtDate(d.updatedAt)}{issue.carriedOver ? " · carried over from an earlier analysis" : ""}</div>
            {d.note && <p className="mt-1.5 text-[13px] text-ink">“{d.note}”</p>}
          </>
        ) : <div className="text-[13px] text-ink3">Not reviewed yet. Approve or change the recommendation below.</div>}
      </div>
    </div>
  );
}

export function ReviewControls({ issue, compact = false }: { issue: ReviewedIssue; compact?: boolean }) {
  const { review, resetReview, allIssues, ds } = useWs();
  const [priority, setPriority] = useState<Priority>(issue.finalPriority);
  const [name, setName] = useState(issue.finalName);
  const [area, setArea] = useState(issue.finalArea);
  const [custom, setCustom] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPriority(issue.finalPriority); setName(issue.finalName); setArea(issue.finalArea); setNote(""); setCustom(false); }, [issue.key, issue.finalPriority, issue.finalName, issue.finalArea]);

  const areas = useMemo(() => {
    const s = new Set<string>();
    ds?.records.forEach((r) => r.area && s.add(r.area));
    allIssues.forEach((i) => { s.add(i.area); s.add(i.finalArea); });
    return [...s].filter(Boolean).sort();
  }, [ds, allIssues]);

  const dirty = priority !== issue.finalPriority || name.trim() !== issue.finalName || area.trim() !== issue.finalArea;
  const idp = `rv-${issue.key}`;
  const go = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  return (
    <div className={`flex flex-col gap-3 ${compact ? "" : "rounded-lg border border-line p-4"}`} data-testid="review-controls">
      {!compact && <div className="flex items-center justify-between"><div className="eyebrow">Review this recommendation</div><ReviewBadge state={issue.reviewState} when={issue.decision?.updatedAt} /></div>}
      <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr]">
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-ink2">Priority</legend>
          <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup">
            {PRIORITIES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${priority === p ? (p === "High" ? "bg-critsoft text-crit" : p === "Medium" ? "bg-warnsoft text-warn" : "bg-lowsoft text-low") : "text-ink2 hover:bg-surface2"}`}>
                {p}{p === issue.priority && <span className="ml-1 text-2xs opacity-70" title="System recommendation">(sys)</span>}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-ink2">Issue name</span>
          <input id={`${idp}-name`} className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-ink2">Category / product area</span>
          {custom ? (
            <span className="flex gap-1"><input id={`${idp}-area-custom`} className="input flex-1" value={area} onChange={(e) => setArea(e.target.value)} placeholder="New category" autoFocus /><button className="btn !px-2" onClick={() => { setCustom(false); setArea(issue.finalArea); }} aria-label="Cancel new category"><Icon name="x" size={12} /></button></span>
          ) : (
            <select id={`${idp}-area`} className="input" value={area} onChange={(e) => (e.target.value === "__new" ? (setCustom(true), setArea("")) : setArea(e.target.value))}>
              {areas.map((a) => <option key={a} value={a}>{a}{a === issue.area ? " (system)" : ""}</option>)}
              <option value="__new">New category…</option>
            </select>
          )}
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-ink2">Reviewer note <span className="font-normal text-ink3">— why you agree or changed it (saved to Review History)</span></span>
        <textarea id={`${idp}-note`} className="input min-h-[56px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Already being addressed in the Q4 roadmap." />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {issue.reviewState === "system" && !dirty && (
          <button className="btn btn-human" disabled={busy} onClick={() => go(() => review(issue, { approve: true, note }))}><Icon name="check" />Approve recommendation</button>
        )}
        {dirty && (
          <button className="btn btn-human" disabled={busy || !name.trim() || !area.trim()} onClick={() => go(() => review(issue, { priority, name, area, note, approve: issue.reviewState === "system" }))}><Icon name="check" />Save decision</button>
        )}
        {!dirty && issue.reviewState !== "system" && note.trim() && (
          <button className="btn" disabled={busy} onClick={() => go(() => review(issue, { note }))}>Add note</button>
        )}
        {issue.reviewState !== "system" && (
          <button className="btn" disabled={busy} onClick={() => go(() => resetReview(issue, note))}><Icon name="refresh" />Reset to system</button>
        )}
        {dirty && <button className="text-xs text-ink2 hover:underline" onClick={() => { setPriority(issue.finalPriority); setName(issue.finalName); setArea(issue.finalArea); }}>Discard edits</button>}
      </div>
    </div>
  );
}

export function QualityPanel() {
  const { full } = useWs();
  if (!full) return null;
  return (
    <ul className="flex flex-col gap-2" data-testid="quality">
      {full.checks.map((c) => (
        <li key={c.id} className="flex gap-2 text-[13px]">
          <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${c.pass ? "bg-humansoft text-human" : "bg-critsoft text-crit"}`}><Icon name={c.pass ? "check" : "alert"} size={11} /></span>
          <span className="min-w-0"><span className="font-medium">{c.label}</span> <span className="text-ink3">— {c.detail}</span>
            {!c.pass && <ul className="mt-1 list-disc pl-4 text-xs text-crit">{c.failures.map((f, k) => <li key={k}>{f}</li>)}</ul>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FieldsUsed({ dense = false }: { dense?: boolean }) {
  const { mapping, ds } = useWs();
  const present = (role: string) => !!(mapping as Record<string, string>)[role] && !!ds?.records.some((r) => { const v = (r as unknown as Record<string, unknown>)[role === "escalation" ? "escalated" : role === "comment" ? "text" : role]; return v !== undefined && v !== null && v !== ""; });
  const important = ROLE_SPECS.filter((s) => s.group !== "context");
  const used = important.filter((s) => present(s.role));
  const missing = important.filter((s) => !present(s.role));
  return (
    <div className={`grid gap-4 ${dense ? "" : "sm:grid-cols-2"}`} data-testid="fields-used">
      <div>
        <div className="eyebrow mb-1.5">Using</div>
        <ul className="flex flex-col gap-1 text-[13px]">
          {used.map((s) => (
            <li key={s.role} className="flex items-start gap-1.5"><Icon name="check" size={14} className="mt-0.5 shrink-0 text-human" /><span>{s.label} <span className="text-ink3">· {(mapping as Record<string, string>)[s.role]}</span></span></li>
          ))}
        </ul>
      </div>
      <div>
        <div className="eyebrow mb-1.5">Not available</div>
        {missing.length ? (
          <ul className="flex flex-col gap-1 text-[13px] text-ink3">
            {missing.map((s) => <li key={s.role} className="flex items-start gap-1.5"><Icon name="dash" size={14} className="mt-0.5 shrink-0" /><span>{s.label} <span className="text-2xs">({s.usedFor.toLowerCase()} not scored)</span></span></li>)}
          </ul>
        ) : <p className="text-[13px] text-ink3">Every field the analysis can use is present.</p>}
      </div>
    </div>
  );
}
export const _r = React;
