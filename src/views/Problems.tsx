import React, { useState } from "react";
import { useWs } from "../state";
import { Card, Icon, Meter, PriorityPill, ReviewBadge, SectionTitle } from "../components/ui";
import { DecisionStrip, ReviewControls } from "../components/Review";
import { ScopeNote } from "../components/Shell";

export function Methodology() {
  const { settings } = useWs();
  const w = settings.weights;
  const rows = [
    ["Frequency", "Number of related comments, as a share of problem comments", "High ≥ 20% · Medium ≥ 10%", w.frequency],
    ["Severity", "Average rating (or negative sentiment); support escalations shown alongside", "High ≤ 2.0/5 · Medium ≤ 2.75/5", w.severity],
    ["Customer impact", "Which customers: highest-value segment share, contract value, paying share", "High = mostly top segment or top-quartile ACV · Medium = mostly paying", w.customer],
    ["Business impact", "Cancellations, churn-risk flags and negative outcomes (e.g. expansion delayed)", "High = 2+ cancellations or ≥ 50% high risk · Medium = any early signal", w.business],
    ["Evidence strength", "Independent accounts (repeats removed), source types, theme consistency", "High ≥ 8 accounts · Medium ≥ 4", w.evidence],
  ] as const;
  return (
    <details className="card group p-0" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <div><div className="eyebrow">Priority methodology</div><div className="text-[15px] font-semibold">How priority is calculated</div></div>
        <Icon name="down" className="text-ink3 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-5 pb-5 pt-3">
        <div className="scroll-x">
          <table className="data min-w-[680px]">
            <thead><tr><th>Signal</th><th>What it measures</th><th>Grade thresholds</th><th className="text-right">Weight</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r[0]}><td className="font-medium">{r[0]}</td><td className="text-ink2">{r[1]}</td><td className="text-xs text-ink2">{r[2]}</td><td className="text-right tnum">×{r[3]}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[80ch] text-[13px] text-ink2">
          Each signal is graded High (2), Medium (1) or Low (0). The score is the weighted sum divided by the maximum possible for the signals this dataset can measure; signals without data are left out rather than guessed.
          Score ≥ {Math.round(w.highThreshold * 100)} → <b>High</b>, ≥ {Math.round(w.mediumThreshold * 100)} → <b>Medium</b>, otherwise <b>Lower</b>. An issue backed by fewer than 4 independent accounts, or scored on frequency alone, is capped at Medium.
          These are judgment calls, not objective truth — adjust weights in Analysis Instructions, and override any result below.
        </p>
      </div>
    </details>
  );
}

export default function Problems() {
  const { issues, select } = useWs();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle eyebrow="Step 3 → 5 · Prioritize, review, challenge" title="Customer Problems" sub="Every issue with its underlying signals. Expand a row to approve, change priority, rename, recategorize or add a note." />
      <ScopeNote />
      <Methodology />
      <Card className="p-0">
        <div className="scroll-x">
          <table className="data min-w-[1040px]" data-testid="problems-table">
            <thead><tr><th>Priority</th><th>Issue</th><th>Frequency</th><th>Severity</th><th>Customer impact</th><th>Business impact</th><th>Evidence</th><th className="text-right">Score</th><th>Review</th><th /></tr></thead>
            <tbody>
              {issues.map((i) => {
                const g = (k: string) => i.signals.find((s) => s.key === k)!;
                const isOpen = open === i.key;
                return (
                  <React.Fragment key={i.key}>
                    <tr className={isOpen ? "bg-surface2" : "hover:bg-surface2"}>
                      <td><div className="flex flex-col items-start gap-1"><PriorityPill p={i.finalPriority} size="sm" />{i.finalPriority !== i.priority && <span className="text-2xs text-ink3">sys: {i.priority}</span>}</div></td>
                      <td className="min-w-[220px]">
                        <button className="text-left font-medium hover:underline" onClick={() => select(i.key)}>{i.finalName}</button>
                        {i.finalName !== i.name && <div className="text-2xs text-ink3">system name: {i.name}</div>}
                        <div className="text-xs text-ink3">{i.finalArea}{i.finalArea !== i.area ? ` (system: ${i.area})` : ""}</div>
                      </td>
                      {(["frequency", "severity", "customer", "business", "evidence"] as const).map((k) => (
                        <td key={k} title={g(k).detail}><Meter g={g(k).grade} /><div className="mt-0.5 max-w-[150px] text-2xs text-ink3">{g(k).value}</div></td>
                      ))}
                      <td className="text-right">
                        <div className="text-[13px] font-medium tnum">{Math.round(i.score * 100)}</div>
                        <div className="ml-auto mt-1 h-1 w-12 rounded bg-line"><div className="h-1 rounded bg-ink" style={{ width: `${i.score * 100}%` }} /></div>
                      </td>
                      <td><ReviewBadge state={i.reviewState} when={i.decision?.updatedAt} /></td>
                      <td><button className="btn !px-2 !py-1 !text-xs" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.key)}>{isOpen ? "Close" : "Review"}</button></td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-surface2"><td colSpan={10}>
                        <div className="flex flex-col gap-3 py-2">
                          <p className="max-w-[90ch] text-[13px]"><span className="font-semibold">Why {i.priority}:</span> {i.rationale}</p>
                          <DecisionStrip issue={i} />
                          <ReviewControls issue={i} />
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
