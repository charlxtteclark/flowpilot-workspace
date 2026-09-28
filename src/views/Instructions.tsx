import React, { useEffect, useState } from "react";
import { useWs } from "../state";
import { Card, Icon, SectionTitle } from "../components/ui";
import { FieldsUsed } from "../components/Review";
import { DEFAULT_WEIGHTS, RECOMMENDED_INSTRUCTIONS } from "../lib/instructions";
import { ROLE_SPECS } from "../lib/ingest/schema";
import type { FieldMapping, FieldRole, Weights } from "../lib/types";

function InstructionsEditor() {
  const { settings, saveSettings } = useWs();
  const [text, setText] = useState(settings.instructions);
  useEffect(() => setText(settings.instructions), [settings.instructions]);
  const dirty = text !== settings.instructions;
  return (
    <details className="card group p-0" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <div><div className="eyebrow">Reusable brief</div><div className="text-[15px] font-semibold">Analysis Instructions</div></div>
        <Icon name="down" className="text-ink3 transition group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-5 pb-5 pt-4">
        <p className="max-w-[80ch] text-[13px] text-ink2">The standing brief for this workspace. Claude-assisted clustering sends it with every run, along with earlier reviewer corrections, so nobody has to rebuild the prompt. The rules engine follows the same principles through the signal weights below.</p>
        <textarea id="instructions-text" data-testid="instructions-text" className="input min-h-[320px] font-mono !text-[12.5px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={!dirty} onClick={() => saveSettings({ ...settings, instructions: text })}><Icon name="check" />Save instructions</button>
          <button className="btn" disabled={text === RECOMMENDED_INSTRUCTIONS} onClick={() => setText(RECOMMENDED_INSTRUCTIONS)}><Icon name="refresh" />Reset to recommended instructions</button>
          {dirty && <span className="text-xs text-warn">Unsaved changes</span>}
          {settings.updatedAt && !dirty && <span className="text-xs text-ink3">Saved {new Date(settings.updatedAt).toLocaleString()}</span>}
        </div>
      </div>
    </details>
  );
}

function WeightsEditor() {
  const { settings, saveSettings } = useWs();
  const [w, setW] = useState<Weights>(settings.weights);
  useEffect(() => setW(settings.weights), [settings.weights]);
  const dirty = JSON.stringify(w) !== JSON.stringify(settings.weights);
  const sliders: [keyof Weights, string, number, number, number][] = [
    ["frequency", "Frequency", 0, 3, 0.25], ["severity", "Severity", 0, 3, 0.25], ["customer", "Customer impact", 0, 3, 0.25],
    ["business", "Business impact", 0, 3, 0.25], ["evidence", "Evidence strength", 0, 3, 0.25],
    ["highThreshold", "High priority at score ≥", 0.3, 0.95, 0.01], ["mediumThreshold", "Medium priority at score ≥", 0.1, 0.8, 0.01],
  ];
  return (
    <Card className="p-5">
      <SectionTitle title="Signal weights" sub="How much each signal counts toward priority. Raising Frequency to dominate the others reproduces a mentions-only ranking — try it to see the difference." />
      <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
        {sliders.map(([k, label, min, max, step]) => (
          <label key={k} className="flex items-center gap-3 text-[13px]">
            <span className="w-44 shrink-0 text-ink2">{label}</span>
            <input id={`w-${k}`} type="range" min={min} max={max} step={step} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="flex-1 accent-[rgb(var(--accent))]" />
            <span className="w-12 text-right font-medium tnum">{k.includes("Threshold") ? Math.round(w[k] * 100) : `×${w[k]}`}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!dirty || w.mediumThreshold >= w.highThreshold} onClick={() => saveSettings({ ...settings, weights: w })}><Icon name="refresh" />Save and re-run</button>
        <button className="btn" disabled={JSON.stringify(w) === JSON.stringify(DEFAULT_WEIGHTS)} onClick={() => setW(DEFAULT_WEIGHTS)}>Reset to recommended weights</button>
        {w.mediumThreshold >= w.highThreshold && <span className="text-xs text-crit">Medium threshold must be below High.</span>}
      </div>
    </Card>
  );
}

function MappingEditor() {
  const { raw, mapping, setMapping, dsError } = useWs();
  const [m, setM] = useState<FieldMapping>(mapping);
  useEffect(() => setM(mapping), [mapping]);
  if (!raw) return null;
  const dirty = JSON.stringify(m) !== JSON.stringify(mapping);
  return (
    <Card className="p-5">
      <SectionTitle title="Data fields" sub={`Detected automatically from ${raw.columns.length} columns in “${raw.name}”. Correct any mapping and re-run; optional fields can stay empty.`} />
      {dsError && <p className="mt-3 rounded-md bg-critsoft p-3 text-[13px] text-crit">{dsError}</p>}
      <div className="mt-4"><FieldsUsed /></div>
      <details className="mt-4">
        <summary className="cursor-pointer text-[13px] font-medium text-accent">Edit column mapping</summary>
        <div className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
          {ROLE_SPECS.map((s) => (
            <label key={s.role} className="flex items-center gap-3 text-[13px]">
              <span className="w-44 shrink-0 text-ink2">{s.label}{s.group === "required" && <span className="text-crit"> *</span>}</span>
              <select id={`map-${s.role}`} className="input min-w-0 flex-1" value={m[s.role] ?? ""} onChange={(e) => setM({ ...m, [s.role as FieldRole]: e.target.value || undefined })}>
                <option value="">— Not available —</option>
                {raw.columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          ))}
        </div>
        <button className="btn btn-primary mt-3" disabled={!dirty || !m.comment} onClick={() => setMapping(JSON.parse(JSON.stringify(m)))}><Icon name="refresh" />Apply mapping and re-run</button>
      </details>
    </Card>
  );
}

function ClaudePanel() {
  const { ai, aiState, runAi, cancelAi, clearAi, decisions } = useWs();
  const corrections = decisions.filter((d) => d.status === "modified" || d.note);
  return (
    <Card className="p-5">
      <SectionTitle title="Claude-assisted clustering" sub="Optional. Claude reads the problem comments with the instructions above and proposes issue groups, names, problem statements and research questions. The workspace then recomputes every metric, rejects unknown ids and re-runs the evidence checks." />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {aiState.status === "running"
          ? <><span className="inline-flex items-center gap-2 text-[13px] text-ink2"><span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />Claude is grouping the comments…</span><button className="btn" onClick={cancelAi}>Stop</button></>
          : <button className="btn btn-primary" onClick={runAi}><Icon name="sparkle" />{ai ? "Run again with Claude" : "Refine with Claude"}</button>}
        {ai && <button className="btn" onClick={clearAi}>Use rules engine</button>}
      </div>
      {aiState.message && <p className={`mt-3 rounded-md p-3 text-[13px] ${aiState.status === "error" ? "bg-critsoft text-crit" : "bg-surface2 text-ink2"}`}>{aiState.message}</p>}
      {ai && (
        <p className="mt-3 text-[13px] text-ink2">Active: {ai.clusters.length} Claude-proposed issues.{ai.report.dropped.length ? ` Rejected ${ai.report.dropped.length} unknown id${ai.report.dropped.length === 1 ? "" : "s"}.` : ""}{ai.report.reassigned.length ? ` ${ai.report.reassigned.length} duplicate assignment${ai.report.reassigned.length === 1 ? "" : "s"} ignored.` : ""}{ai.report.unassigned.length ? ` ${ai.report.unassigned.length} comments left unassigned.` : ""}</p>
      )}
      <div className="mt-4">
        <div className="eyebrow mb-1.5">Reviewer corrections sent as context</div>
        {corrections.length ? (
          <ul className="flex flex-col gap-1 text-[13px] text-ink2">{corrections.map((d) => <li key={d.issueKey}>“{d.systemName}” → {[d.name && `renamed “${d.name}”`, d.area && `category ${d.area}`, d.priority && `priority ${d.priority}`, d.note && `note: “${d.note}”`].filter(Boolean).join("; ")}</li>)}</ul>
        ) : <p className="text-[13px] text-ink3">None yet. Changes you make in Customer Problems will be reused here.</p>}
      </div>
    </Card>
  );
}

export default function Instructions() {
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle eyebrow="Repeatable workspace" title="Analysis Instructions" sub="Instructions, weights and field mapping are saved with the workspace, so each new export is analyzed the same way." />
      <InstructionsEditor />
      <WeightsEditor />
      <MappingEditor />
      <ClaudePanel />
    </div>
  );
}
export const _r = React;
