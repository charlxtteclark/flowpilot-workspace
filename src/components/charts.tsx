// 7. Visualization — small hand-built charts that read the theme tokens.
import React, { useState } from "react";
import type { Priority } from "../lib/types";

const PCOLOR: Record<Priority, string> = { High: "rgb(var(--crit))", Medium: "rgb(var(--warn))", Lower: "rgb(var(--low))" };

/* Horizontal bars (single series) */
export function BarList({ rows, unit, onSelect }: { rows: { key: string; label: string; value: number; hint?: string }[]; unit: string; onSelect?: (key: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-1.5" role="list">
      {rows.map((r) => (
        <button key={r.key} role="listitem" type="button" onClick={() => onSelect?.(r.key)} disabled={!onSelect}
          className="group grid grid-cols-[minmax(90px,38%)_1fr] items-center gap-3 rounded px-1 py-0.5 text-left enabled:hover:bg-surface2"
          title={`${r.label}: ${r.value} ${unit}${r.hint ? ` — ${r.hint}` : ""}`}>
          <span className="truncate text-[13px] text-ink2">{r.label}</span>
          <span className="flex items-center gap-2">
            <span className="h-[14px] rounded-r-[4px] bg-s1 transition-[width]" style={{ width: `${(r.value / max) * 85}%`, minWidth: r.value ? 3 : 0 }} />
            <span className="text-xs tnum text-ink">{r.value}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* Dot plot on a rating scale — lower is worse */
export function SeverityDots({ rows, max = 5, onSelect }: { rows: { key: string; label: string; value: number | null; lowShare: number; priority: Priority }[]; max?: number; onSelect?: (k: string) => void }) {
  const ticks = Array.from({ length: max }, (_, i) => i + 1);
  const x = (v: number) => ((v - 1) / (max - 1)) * 100;
  return (
    <div>
      <div className="grid grid-cols-[minmax(90px,38%)_1fr] gap-3 pb-1">
        <span />
        <div className="relative h-4 text-2xs text-ink3">
          {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2 tnum" style={{ left: `${x(t)}%` }}>{t}</span>)}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <button key={r.key} type="button" onClick={() => onSelect?.(r.key)} className="grid grid-cols-[minmax(90px,38%)_1fr] items-center gap-3 rounded px-1 py-1 text-left hover:bg-surface2"
            title={r.value == null ? `${r.label}: no ratings` : `${r.label}: avg ${r.value.toFixed(2)} / ${max}; ${Math.round(r.lowShare * 100)}% rated ≤ 2`}>
            <span className="truncate text-[13px] text-ink2">{r.label}</span>
            <span className="relative h-4">
              <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
              {ticks.map((t) => <span key={t} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line" style={{ left: `${x(t)}%` }} />)}
              {r.value != null && (
                <span className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface" style={{ left: `${x(r.value)}%`, background: "rgb(var(--s1))" }} />
              )}
              {r.value != null && <span className="absolute top-1/2 -translate-y-1/2 pl-2 text-2xs tnum text-ink2" style={{ left: `${x(r.value)}%` }}>{r.value.toFixed(1)}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[minmax(90px,38%)_1fr] gap-3 text-2xs text-ink3"><span /><span className="flex justify-between"><span>← more severe</span><span>milder →</span></span></div>
    </div>
  );
}

/* Paired bars: cancellations and high churn risk per issue */
export function ChurnBars({ rows, onSelect, hasCanceled, hasChurn }: { rows: { key: string; label: string; n: number; canceled: number; highChurn: number }[]; onSelect?: (k: string) => void; hasCanceled: boolean; hasChurn: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink2">
        {hasCanceled && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-s2" />Canceled</span>}
        {hasChurn && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-s1" />High churn risk</span>}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-line" />All comments</span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <button key={r.key} type="button" onClick={() => onSelect?.(r.key)} className="grid grid-cols-[minmax(90px,38%)_1fr] items-center gap-3 rounded px-1 py-0.5 text-left hover:bg-surface2"
            title={`${r.label}: ${r.canceled} canceled, ${r.highChurn} high churn risk, of ${r.n} comments`}>
            <span className="truncate text-[13px] text-ink2">{r.label}</span>
            <span className="flex flex-col gap-[2px]">
              {hasCanceled && <Bar w={r.canceled / max} bg="bg-s2" track={r.n / max} label={`${r.canceled}`} />}
              {hasChurn && <Bar w={r.highChurn / max} bg="bg-s1" track={r.n / max} label={`${r.highChurn}`} />}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-2xs text-ink3">Grey track = all comments on the issue, so each bar reads as a share of its own volume.</p>
    </div>
  );
}
function Bar({ w, bg, track, label }: { w: number; bg: string; track: number; label: string }) {
  return (
    <span className="relative flex h-[9px] items-center">
      <span className="absolute left-0 h-full rounded-r-[3px] bg-line" style={{ width: `${track * 85}%` }} />
      <span className={`absolute left-0 h-full rounded-r-[3px] ${bg}`} style={{ width: `${w * 85}%`, minWidth: w ? 3 : 0 }} />
      <span className="absolute text-2xs tnum text-ink2" style={{ left: `calc(${track * 85}% + 6px)` }}>{label}</span>
    </span>
  );
}

/* Frequency vs business impact */
export function ImpactScatter({ points, yLabel, yFormat, onSelect }: {
  points: { key: string; label: string; x: number; y: number; priority: Priority; detail: string }[];
  yLabel: string; yFormat: (v: number) => string; onSelect?: (k: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 720, H = 360, L = 52, R = 40, T = 18, B = 44;
  const xmax = Math.max(4, ...points.map((p) => p.x)) * 1.1;
  const ymax = 1;
  const sx = (v: number) => L + (v / xmax) * (W - L - R);
  const sy = (v: number) => T + (1 - v / ymax) * (H - T - B);
  const xs = [...points.map((p) => p.x)].sort((a, b) => a - b);
  const xMid = xs.length ? xs[Math.floor(xs.length / 2)] : xmax / 2;
  const yMid = 0.5;
  // Greedy label placement to avoid overlaps.
  const placed: { x1: number; x2: number; y: number }[] = [];
  const hit = (x1: number, x2: number, y: number) => placed.some((q) => x1 < q.x2 && x2 > q.x1 && Math.abs(q.y - y) < 13) || points.some((p) => { const px = sx(p.x), py = sy(p.y); return px > x1 - 4 && px < x2 + 4 && Math.abs(py - (y - 4)) < 8; });
  const labels = [...points].sort((a, b) => sy(a.y) - sy(b.y) || sx(a.x) - sx(b.x)).map((p) => {
    const w = Math.min(26, p.label.length) * 6.2;
    const px = sx(p.x), py = sy(p.y);
    const cands: [number, number, "start" | "end"][] = [[px + 10, py + 4, "start"], [px - 10, py + 4, "end"], [px + 10, py - 10, "start"], [px + 10, py + 18, "start"], [px - 10, py - 10, "end"], [px - 10, py + 18, "end"], [px + 10, py + 32, "start"]];
    let pick = cands.find((c) => (c[2] === "start" ? c[0] + w <= W - 4 : c[0] - w >= L + 2)) ?? cands[0];
    for (const c of cands) { const x1 = c[2] === "start" ? c[0] : c[0] - w; if (x1 >= L + 2 && x1 + w <= W - 4 && !hit(x1, x1 + w, c[1])) { pick = c; break; } }
    const x1 = pick[2] === "start" ? pick[0] : pick[0] - w;
    placed.push({ x1, x2: x1 + w, y: pick[1] });
    return { key: p.key, lx: pick[0], ly: pick[1], anchor: pick[2] };
  });
  const xticks = niceTicks(xmax);
  const hp = points.find((p) => p.key === hover);
  return (
    <div className="relative scroll-x">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] max-w-[980px]" role="img" aria-label={`Scatter of issues: comment count versus ${yLabel}`}>
        {/* quadrant shading */}
        <rect x={L} y={T} width={sx(xMid) - L} height={sy(yMid) - T} fill="rgb(var(--crit) / 0.06)" />
        <text x={L + 8} y={T + 16} fontSize="11" fill="rgb(var(--ink-3))">Lower frequency · high impact</text>
        <rect x={sx(xMid)} y={sy(yMid)} width={W - R - sx(xMid)} height={H - B - sy(yMid)} fill="rgb(var(--low) / 0.06)" />
        <text x={W - R - 8} y={sy(yMid) + 16} fontSize="11" fill="rgb(var(--ink-3))" textAnchor="end">High frequency · low impact</text>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="rgb(var(--line))" strokeWidth="1" />
            <text x={L - 8} y={sy(t) + 4} fontSize="11" textAnchor="end" fill="rgb(var(--ink-3))">{yFormat(t)}</text>
          </g>
        ))}
        {xticks.map((t) => (
          <text key={t} x={sx(t)} y={H - B + 18} fontSize="11" textAnchor="middle" fill="rgb(var(--ink-3))">{t}</text>
        ))}
        <line x1={sx(xMid)} x2={sx(xMid)} y1={T} y2={H - B} stroke="rgb(var(--ink-3))" strokeOpacity="0.35" strokeWidth="1" />
        <line x1={L} x2={W - R} y1={sy(yMid)} y2={sy(yMid)} stroke="rgb(var(--ink-3))" strokeOpacity="0.35" strokeWidth="1" />
        <text x={(L + W - R) / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="rgb(var(--ink-2))">Comments (frequency)</text>
        <text transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`} fontSize="11" textAnchor="middle" fill="rgb(var(--ink-2))">{yLabel}</text>
        {points.map((p) => (
          <g key={p.key} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(p.key)} style={{ cursor: onSelect ? "pointer" : "default" }}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r="14" fill="transparent" />
            <circle cx={sx(p.x)} cy={sy(p.y)} r={hover === p.key ? 7 : 5.5} fill={PCOLOR[p.priority]} stroke="rgb(var(--surface))" strokeWidth="2" />
          </g>
        ))}
        {labels.map((l) => {
          const p = points.find((q) => q.key === l.key)!;
          return <text key={l.key} x={l.lx} y={l.ly} textAnchor={l.anchor} fontSize="11.5" fill="rgb(var(--ink))" fontWeight={p.priority === "High" ? 600 : 400}>{truncate(p.label, 26)}</text>;
        })}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute right-2 top-2 max-w-[260px] rounded-md border border-line bg-surface p-2 text-xs shadow">
          <div className="font-semibold">{hp.label}</div>
          <div className="text-ink2">{Math.round(hp.x)} comments · {yLabel.toLowerCase()}: {yFormat(hp.y)}</div>
          <div className="text-ink3">{hp.detail}</div>
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-ink2">
        {(["High", "Medium", "Lower"] as Priority[]).map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PCOLOR[p] }} />{p} priority</span>
        ))}
      </div>
    </div>
  );
}

/* Slopegraph: rank by mentions vs rank by priority */
export function RankSlope({ rows, onSelect }: { rows: { key: string; label: string; freqRank: number; priRank: number; priority: Priority; count: number }[]; onSelect?: (k: string) => void }) {
  const n = rows.length;
  const W = 600, rowH = 30, T = 30, H = T + n * rowH + 6;
  const lx = 200, rx = 400;
  const y = (r: number) => T + (r - 0.5) * rowH;
  return (
    <div className="scroll-x">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] max-w-[720px]" role="img" aria-label="Rank by number of mentions compared with rank by priority">
        <text x={lx} y={16} fontSize="11" fontWeight="600" textAnchor="end" fill="rgb(var(--ink-3))" letterSpacing="0.06em">MOST MENTIONED</text>
        <text x={rx} y={16} fontSize="11" fontWeight="600" fill="rgb(var(--ink-3))" letterSpacing="0.06em">HIGHEST PRIORITY</text>
        {rows.map((r) => {
          const moved = Math.abs(r.freqRank - r.priRank) >= 2;
          const stroke = moved ? PCOLOR[r.priority] : "rgb(var(--ink-3))";
          return (
            <g key={r.key} onClick={() => onSelect?.(r.key)} style={{ cursor: "pointer" }}>
              <line x1={lx + 8} x2={rx - 8} y1={y(r.freqRank)} y2={y(r.priRank)} stroke={stroke} strokeOpacity={moved ? 0.9 : 0.35} strokeWidth={moved ? 2 : 1.25} />
              <circle cx={lx + 8} cy={y(r.freqRank)} r="3.5" fill={stroke} />
              <circle cx={rx - 8} cy={y(r.priRank)} r="3.5" fill={stroke} />
              <text x={lx} y={y(r.freqRank) + 4} fontSize="12" textAnchor="end" fill="rgb(var(--ink-2))">{truncate(r.label, 24)} <tspan fill="rgb(var(--ink-3))">{r.count}</tspan></text>
              <text x={rx} y={y(r.priRank) + 4} fontSize="12" fill="rgb(var(--ink))" fontWeight={r.priority === "High" ? 600 : 400}>{r.priRank}. {truncate(r.label, 24)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function niceTicks(max: number): number[] {
  const step = max <= 10 ? 2 : max <= 30 ? 5 : max <= 80 ? 10 : Math.ceil(max / 8 / 10) * 10;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}
export type { Priority };
export const _unused = React;
