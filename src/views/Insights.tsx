import React from "react";
import { useWs } from "../state";
import { Card, Icon, SectionTitle } from "../components/ui";
import { BarList, ChurnBars, ImpactScatter, SeverityDots } from "../components/charts";
import { QualityPanel } from "../components/Review";
import { ScopeNote } from "../components/Shell";
import { Methodology } from "./Problems";
import { applyFilters } from "../lib/analysis/pipeline";

export default function Insights() {
  const { ds, analysis, allIssues, filters, setFilters, select, settings } = useWs();
  if (!ds || !analysis) return null;
  const av = analysis.available;
  const scoped = applyFilters(ds.records, filters).filter((r) => r.polarity === "problem");

  const volume = av.area
    ? [...scoped.reduce((m, r) => m.set(r.area ?? "Unspecified", (m.get(r.area ?? "Unspecified") ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, value: v }))
    : allIssues.map((i) => ({ key: i.key, label: i.finalName, value: i.metrics.count })).sort((a, b) => b.value - a.value);

  const G = { High: 2, Medium: 1, Low: 0, "N/A": 0 } as const;
  const wts = { severity: settings.weights.severity, customer: settings.weights.customer, business: settings.weights.business } as const;
  const impactKeys = (["severity", "customer", "business"] as const).filter((k) => allIssues[0]?.signals.find((s) => s.key === k)?.grade !== "N/A");
  const canPlot = impactKeys.length > 0;
  const seen = new Map<string, number>();
  const points = allIssues.map((i) => {
    let num = 0, den = 0;
    for (const k of impactKeys) { const g = i.signals.find((s) => s.key === k)!; num += wts[k] * G[g.grade]; den += wts[k] * 2; }
    const y = den ? num / den : 0;
    const key = `${i.metrics.count}|${y.toFixed(3)}`; const dup = seen.get(key) ?? 0; seen.set(key, dup + 1);
    return {
      key: i.key, label: i.finalName, x: i.metrics.count + dup * 0.35, priority: i.finalPriority, y,
      detail: impactKeys.map((k) => { const g = i.signals.find((s) => s.key === k)!; return `${g.label}: ${g.grade} (${g.value})`; }).join(" · "),
    };
  });
  const bizY = av.canceled || av.churnRisk || av.outcome;

  return (
    <div className="flex flex-col gap-5">
      <SectionTitle eyebrow="Decision-oriented charts" title="Insights" sub="Each chart answers one prioritization question. Click a bar or point to open its evidence." />
      <ScopeNote />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Frequency vs. business impact" sub={<>Impact combines the {impactKeys.map((k) => (k === "customer" ? "customer impact" : k === "business" ? "business impact" : k)).join(", ")} grades with their weights; frequency is left out so the two axes are independent. The upper-left is what a mentions-only ranking misses.{!bizY && " This dataset has no cancellation, churn or outcome fields, so business impact isn't part of it."}</>} />
          <div className="mt-3">
            {canPlot
              ? <ImpactScatter points={points} yLabel="Impact score (frequency excluded)" yFormat={(v) => `${Math.round(v * 100)}`} onSelect={select} />
              : <Empty text="This dataset has no cancellation, churn-risk or rating fields, so business impact can't be plotted. Add them to see which issues are high-impact." />}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title={av.area ? "Complaint volume by product area" : "Complaint volume by issue"} sub={`${scoped.length} problem comments. ${av.area ? "Click an area to filter the workspace to it." : "No product-area field; grouped by detected issue."}`} />
          <div className="mt-4"><BarList rows={volume} unit="comments" onSelect={av.area ? (k) => setFilters({ ...filters, areas: [k] }) : select} /></div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Severity by issue" sub="Average rating per issue; further left is more severe." />
          <div className="mt-4">
            {av.rating
              ? <SeverityDots max={ds.ratingMax ?? 5} rows={[...allIssues].sort((a, b) => (a.metrics.avgRating ?? 99) - (b.metrics.avgRating ?? 99)).map((i) => ({ key: i.key, label: i.finalName, value: i.metrics.avgRating, lowShare: 0, priority: i.finalPriority }))} onSelect={select} />
              : <Empty text="No rating field in this dataset, so severity isn't measured." />}
          </div>
        </Card>
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Cancellation and churn risk by issue" sub="Which problems come from customers who canceled or are at high risk of leaving." />
          <div className="mt-4">
            {av.canceled || av.churnRisk
              ? <ChurnBars hasCanceled={av.canceled} hasChurn={av.churnRisk} onSelect={select} rows={[...allIssues].sort((a, b) => (b.metrics.cancellations ?? 0) - (a.metrics.cancellations ?? 0) || (b.metrics.highChurn ?? 0) - (a.metrics.highChurn ?? 0)).map((i) => ({ key: i.key, label: i.finalName, n: i.metrics.count, canceled: i.metrics.cancellations ?? 0, highChurn: i.metrics.highChurn ?? 0 }))} />
              : <Empty text="No cancellation or churn-risk fields in this dataset. Business impact is not claimed." />}
          </div>
        </Card>
      </div>
      <Methodology />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5"><SectionTitle title="Evidence checks" sub="Run on every analysis before recommendations are shown. A failure is listed here, never hidden." /><div className="mt-3"><QualityPanel /></div></Card>
        <Card className="p-5">
          <SectionTitle title="Data notes" sub="Things in the dataset worth knowing before you act." />
          <ul className="mt-3 flex flex-col gap-2 text-[13px]">
            {analysis.notes.map((n, k) => (
              <li key={k} className="flex gap-2"><Icon name={n.kind === "warn" ? "alert" : "check"} size={14} className={`mt-0.5 shrink-0 ${n.kind === "warn" ? "text-warn" : "text-ink3"}`} /><span className="text-ink2">{n.text}</span></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
function Empty({ text }: { text: string }) { return <p className="rounded-md bg-surface2 p-4 text-[13px] text-ink2">{text}</p>; }
export const _r = React;
