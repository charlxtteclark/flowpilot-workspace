import React, { useMemo, useState } from "react";
import { useWs } from "../state";
import { Card, Icon, PriorityPill, SectionTitle, fmtDate } from "../components/ui";
import type { AnalysisSnapshot, Priority } from "../lib/types";

const FIELD: Record<string, string> = { approval: "Approval", priority: "Priority", name: "Issue name", area: "Category", note: "Note", reset: "Reset" };

function ChangeLog() {
  const { history } = useWs();
  const rows = [...history].reverse();
  return (
    <Card className="p-0">
      <div className="px-5 pb-2 pt-4"><SectionTitle title="Review changes" sub="Every human decision, next to what the system originally recommended." /></div>
      {rows.length ? (
        <div className="scroll-x">
          <table className="data min-w-[860px]" data-testid="history-table">
            <thead><tr><th>When</th><th>Issue</th><th>Field</th><th>System recommendation</th><th>Human change</th><th>Why</th></tr></thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap text-xs text-ink2 tnum">{fmtDate(h.at)}</td>
                  <td className="text-[13px] font-medium">{h.issueName}<div className="text-2xs font-normal text-ink3">{h.datasetName}</div></td>
                  <td className="text-xs text-ink2">{FIELD[h.field] ?? h.field}</td>
                  <td className="text-[13px]"><span className="inline-flex items-center gap-1 text-ink2"><Icon name="cpu" size={12} className="text-ink3" />{h.systemValue}</span>{h.before !== h.systemValue && h.field !== "approval" && <div className="text-2xs text-ink3">before this change: {h.before}</div>}</td>
                  <td className="text-[13px]"><span className="inline-flex items-center gap-1 font-medium text-human"><Icon name="user" size={12} />{h.after}</span></td>
                  <td className="max-w-[40ch] text-[13px] text-ink2">{h.note || <span className="text-ink3">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-5 pb-5 text-[13px] text-ink3">No reviews yet. Approve or change a recommendation in Customer Problems or Evidence and it will be logged here.</p>}
    </Card>
  );
}

function CurrentDecisions() {
  const { decisions } = useWs();
  if (!decisions.length) return null;
  return (
    <Card className="p-0">
      <div className="px-5 pb-2 pt-4"><SectionTitle title="Standing decisions" sub="Carried into every future analysis. They're matched to new results by issue key or by overlapping comments, and passed to Claude as context." /></div>
      <div className="scroll-x">
        <table className="data min-w-[760px]">
          <thead><tr><th>System issue</th><th>System priority</th><th>Decision</th><th>Note</th><th>Updated</th></tr></thead>
          <tbody>{decisions.map((d) => (
            <tr key={d.issueKey}>
              <td className="text-[13px]">{d.systemName}<div className="text-2xs text-ink3">{d.systemArea}</div></td>
              <td><PriorityPill p={d.systemPriority} size="sm" /></td>
              <td className="text-[13px]">{d.status === "approved" ? <span className="text-human">Approved</span> : [d.priority && <span key="p" className="mr-2 inline-flex items-center gap-1">→ <PriorityPill p={d.priority} size="sm" /></span>, d.name && <span key="n" className="mr-2">renamed “{d.name}”</span>, d.area && <span key="a">category {d.area}</span>]}</td>
              <td className="max-w-[40ch] text-[13px] text-ink2">{d.note ?? "—"}</td>
              <td className="whitespace-nowrap text-xs text-ink3">{fmtDate(d.updatedAt)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}

function Compare({ a, b }: { a: AnalysisSnapshot; b: AnalysisSnapshot }) {
  const keys = [...new Set([...a.issues.map((i) => i.key), ...b.issues.map((i) => i.key)])];
  const rows = keys.map((k) => ({ k, A: a.issues.find((i) => i.key === k), B: b.issues.find((i) => i.key === k) }));
  const delta = (x?: number | null, y?: number | null) => (x == null || y == null ? null : y - x);
  return (
    <div className="scroll-x">
      <table className="data min-w-[760px]" data-testid="compare-table">
        <thead><tr><th>Issue</th><th>Priority (earlier → later)</th><th className="text-right">Comments</th><th className="text-right">Avg rating</th><th className="text-right">Cancellations</th><th>Change</th></tr></thead>
        <tbody>
          {rows.map(({ k, A, B }) => {
            const dc = delta(A?.count, B?.count);
            const pri = (p?: Priority) => (p ? <PriorityPill p={p} size="sm" /> : <span className="text-ink3">—</span>);
            const change = !A ? "New" : !B ? "No longer present" : A.priority !== B.priority ? "Priority changed" : dc ? "Volume changed" : "Unchanged";
            return (
              <tr key={k}>
                <td className="text-[13px] font-medium">{(B ?? A)!.name}</td>
                <td><span className="inline-flex items-center gap-1.5">{pri(A?.priority)}<Icon name="arrow" size={12} className="text-ink3" />{pri(B?.priority)}</span></td>
                <td className="text-right text-[13px] tnum">{A?.count ?? "—"} → {B?.count ?? "—"}{dc ? <span className={`ml-1 text-2xs ${dc > 0 ? "text-crit" : "text-human"}`}>{dc > 0 ? "+" : ""}{dc}</span> : null}</td>
                <td className="text-right text-[13px] tnum">{A?.avgRating?.toFixed(1) ?? "—"} → {B?.avgRating?.toFixed(1) ?? "—"}</td>
                <td className="text-right text-[13px] tnum">{A?.cancellations ?? "—"} → {B?.cancellations ?? "—"}</td>
                <td className={`text-xs ${change === "Unchanged" ? "text-ink3" : "font-medium"}`}>{change}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Analyses() {
  const { analyses } = useWs();
  const list = useMemo(() => [...analyses].reverse(), [analyses]);
  const [aId, setA] = useState<string>("");
  const [bId, setB] = useState<string>("");
  const a = analyses.find((x) => x.id === (aId || list[1]?.id));
  const b = analyses.find((x) => x.id === (bId || list[0]?.id));
  return (
    <Card className="p-0">
      <div className="px-5 pb-2 pt-4"><SectionTitle title="Previous analyses" sub="Each distinct run is saved with its instructions, weights and results, so you can re-run on next month's export and compare." /></div>
      {list.length ? (
        <>
          <div className="scroll-x">
            <table className="data min-w-[760px]" data-testid="analyses-table">
              <thead><tr><th>Run</th><th>Dataset</th><th className="text-right">Comments</th><th>Engine</th><th>Checks</th><th>Top priorities</th></tr></thead>
              <tbody>{list.map((x) => (
                <tr key={x.id}>
                  <td className="whitespace-nowrap text-xs tnum text-ink2">{fmtDate(x.ranAt)}</td>
                  <td className="text-[13px]">{x.datasetName}</td>
                  <td className="text-right text-[13px] tnum">{x.rowCount}</td>
                  <td className="text-xs">{x.engine === "claude" ? "Claude-assisted" : "Rules"}</td>
                  <td className="text-xs">{x.checksPassed ? <span className="text-human">Passed</span> : <span className="text-crit">Failed</span>}</td>
                  <td className="text-xs text-ink2">{x.issues.filter((i) => i.priority === "High").map((i) => i.name).join(", ") || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {list.length >= 2 && a && b && (
            <div className="border-t border-line px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold">Compare</span>
                <select id="cmp-a" className="input" value={a.id} onChange={(e) => setA(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{fmtDate(x.ranAt)} · {x.datasetName}</option>)}</select>
                <Icon name="arrow" size={14} className="text-ink3" />
                <select id="cmp-b" className="input" value={b.id} onChange={(e) => setB(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{fmtDate(x.ranAt)} · {x.datasetName}</option>)}</select>
              </div>
              <Compare a={a} b={b} />
            </div>
          )}
        </>
      ) : <p className="px-5 pb-5 text-[13px] text-ink3">No saved runs yet.</p>}
    </Card>
  );
}

export default function History() {
  return (
    <div className="flex flex-col gap-5">
      <SectionTitle eyebrow="Step 6 · Save" title="Review History" sub="AI analysis supports product judgment; it doesn't replace it. This log shows what the system recommended, what a person decided, and why." />
      <ChangeLog />
      <CurrentDecisions />
      <Analyses />
    </div>
  );
}
export const _r = React;
