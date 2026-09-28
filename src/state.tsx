// Workspace state: dataset, analysis, human review, history and persistence.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult, AnalysisSnapshot, Decision, FieldMapping, HistoryEntry, NormalizedDataset, Priority, RawDataset, Settings } from "./lib/types";
import { parseCsv } from "./lib/ingest/parseCsv";
import { detectMapping } from "./lib/ingest/schema";
import { normalize } from "./lib/ingest/normalize";
import { analyze, EMPTY_FILTERS, type AiCluster, type Filters } from "./lib/analysis/pipeline";
import { applyDecisions, type ReviewedIssue } from "./lib/review/decisions";
import { openStore, newId, type Store } from "./lib/storage/store";
import { DEFAULT_SETTINGS } from "./lib/instructions";
import { alignKeys, runAiClustering, getSample, type AiRunReport } from "./lib/analysis/aiCluster";
import flowpilotCsv from "./data/flowpilot_feedback.csv?raw";
import commentsOnlyCsv from "./data/flowpilot_comments_only.csv?raw";

export const SAMPLES = {
  full: { label: "FlowPilot Customer Feedback Dataset", csv: flowpilotCsv, note: "Comments plus rating, segment, product area, cancellation and account metadata" },
  commentsOnly: { label: "FlowPilot comments only", csv: commentsOnlyCsv, note: "The same comments without metadata — what the basic prompt had to work with" },
} as const;

export type View = "overview" | "problems" | "evidence" | "insights" | "history" | "instructions";

interface Ctx {
  store: Store | null;
  raw: RawDataset | null;
  mapping: FieldMapping;
  ds: NormalizedDataset | null;
  dsError: string | null;
  datasetLabel: string;
  sampleId: keyof typeof SAMPLES | null;
  settings: Settings;
  filters: Filters;
  setFilters: (f: Filters) => void;
  analysis: AnalysisResult | null;     // filtered scope
  full: AnalysisResult | null;         // whole dataset
  issues: ReviewedIssue[];             // filtered, with decisions applied and priority filter
  allIssues: ReviewedIssue[];          // filtered scope, no priority filter
  decisions: Decision[];
  history: HistoryEntry[];
  analyses: AnalysisSnapshot[];
  ranAt: string | null;
  view: View; setView: (v: View) => void;
  selected: string | null; select: (key: string | null, go?: boolean) => void;
  loadSample: (id: keyof typeof SAMPLES) => void;
  loadFile: (file: File) => Promise<void>;
  setMapping: (m: FieldMapping) => void;
  rerun: () => void;
  saveSettings: (s: Settings) => Promise<void>;
  review: (issue: ReviewedIssue, patch: { approve?: boolean; priority?: Priority; name?: string; area?: string; note?: string }) => Promise<void>;
  resetReview: (issue: ReviewedIssue, note: string) => Promise<void>;
  ai: { clusters: AiCluster[]; report: AiRunReport; hash: string } | null;
  aiState: { status: "idle" | "running" | "error" | "unavailable"; message?: string };
  runAi: () => Promise<void>;
  cancelAi: () => void;
  clearAi: () => void;
  toast: string | null; setToast: (s: string | null) => void;
}

const C = createContext<Ctx | null>(null);
export const useWs = () => { const c = useContext(C); if (!c) throw new Error("no ctx"); return c; };

const VIEWS: View[] = ["overview", "problems", "evidence", "insights", "history", "instructions"];

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<Store | null>(null);
  const [raw, setRaw] = useState<RawDataset | null>(null);
  const [mapping, setMappingState] = useState<FieldMapping>({});
  const [datasetLabel, setLabel] = useState<string>(SAMPLES.full.label);
  const [sampleId, setSampleId] = useState<keyof typeof SAMPLES | null>("full");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisSnapshot[]>([]);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const [view, setViewState] = useState<View>(() => { const h = location.hash.slice(1) as View; return VIEWS.includes(h) ? h : "overview"; });
  const [selected, setSelected] = useState<string | null>(null);
  const [ai, setAi] = useState<Ctx["ai"]>(null);
  const [aiState, setAiState] = useState<Ctx["aiState"]>({ status: "idle" });
  const [toast, setToast] = useState<string | null>(null);
  const aiCtl = useRef<AbortController | null>(null);

  const setView = useCallback((v: View) => { setViewState(v); try { history_replace(v); } catch { /* ignore */ } window.scrollTo({ top: 0 }); }, []);
  useEffect(() => { const h = () => { const v = location.hash.slice(1) as View; if (VIEWS.includes(v)) setViewState(v); }; window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);

  const ingest = useCallback((text: string, name: string, label: string, sid: keyof typeof SAMPLES | null) => {
    const r = parseCsv(text, name);
    setRaw(r); setMappingState(detectMapping(r.columns, r.rows)); setLabel(label); setSampleId(sid);
    setFilters(EMPTY_FILTERS); setAi(null); setSelected(null); setRanAt(new Date().toISOString()); setRunNonce((n) => n + 1);
  }, []);

  // Boot: open storage, load saved state, then load the sample dataset.
  useEffect(() => {
    (async () => {
      ingest(SAMPLES.full.csv, "flowpilot_feedback.csv", SAMPLES.full.label, "full");
      const s = await openStore();
      setStore(s);
      const [st, ds, hs, an] = await Promise.all([s.loadSettings(), s.loadDecisions(), s.loadHistory(), s.loadAnalyses()]).catch(() => [null, [], [], []] as const);
      if (st) setSettings({ ...DEFAULT_SETTINGS, ...st, weights: { ...DEFAULT_SETTINGS.weights, ...(st as Settings).weights } });
      setDecisions(ds as Decision[]); setHistory(hs as HistoryEntry[]); setAnalyses(an as AnalysisSnapshot[]);
      setRunNonce((n) => n + 1);
    })();
  }, [ingest]);

  // Live updates from other reviewers.
  useEffect(() => {
    if (!store?.subscribe) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = store.subscribe(() => {
      clearTimeout(t);
      t = setTimeout(async () => { setDecisions(await store.loadDecisions()); setHistory(await store.loadHistory()); }, 400);
    });
    return () => { clearTimeout(t); off(); };
  }, [store]);

  const { ds, dsError } = useMemo(() => {
    if (!raw) return { ds: null, dsError: null };
    try { return { ds: normalize(raw, mapping), dsError: null }; } catch (e) { return { ds: null, dsError: (e as Error).message }; }
  }, [raw, mapping]);

  const aiForDs = ai && ds && ai.hash === ds.hash ? ai.clusters : undefined;
  const full = useMemo(() => (ds ? analyze(ds, settings.weights, EMPTY_FILTERS, aiForDs) : null), [ds, settings.weights, aiForDs]);
  const analysis = useMemo(() => (ds ? analyze(ds, settings.weights, filters, aiForDs) : null), [ds, settings.weights, filters, aiForDs]);
  const allIssues = useMemo(() => (analysis ? applyDecisions(analysis.issues, decisions) : []), [analysis, decisions]);
  const issues = useMemo(() => {
    const f = filters.priorities.length ? allIssues.filter((i) => filters.priorities.includes(i.finalPriority)) : allIssues;
    const order = { High: 0, Medium: 1, Lower: 2 } as const;
    return [...f].sort((a, b) => order[a.finalPriority] - order[b.finalPriority] || a.priorityRank - b.priorityRank);
  }, [allIssues, filters.priorities]);

  // Save a snapshot of each distinct analysis run (repeatability + comparison over time).
  const lastSaved = useRef<string>("");
  useEffect(() => {
    if (!store || !full || !ds || !ranAt) return;
    const sig = JSON.stringify([ds.hash, full.engine, settings.weights, settings.instructions, full.issues.map((i) => [i.key, i.priority, i.metrics.count])]);
    if (sig === lastSaved.current) return;
    const prev = analyses[analyses.length - 1];
    const prevSig = prev ? JSON.stringify([prev.datasetHash, prev.engine, prev.weights, prev.instructions, prev.issues.map((i) => [i.key, i.priority, i.count])]) : "";
    lastSaved.current = sig;
    if (sig === prevSig) return;
    const snap: AnalysisSnapshot = {
      id: newId(), datasetName: datasetLabel, datasetHash: ds.hash, rowCount: ds.records.length, engine: full.engine, ranAt,
      instructions: settings.instructions, weights: settings.weights, checksPassed: full.checks.every((c) => c.pass),
      issues: full.issues.map((i) => ({ key: i.key, name: i.name, area: i.area, priority: i.priority, count: i.metrics.count, avgRating: i.metrics.avgRating, cancellations: i.metrics.cancellations, score: Math.round(i.score * 1000) / 1000 })),
      aiAssignments: full.engine === "claude" ? full.issues.map((i) => ({ key: i.key, name: i.name, area: i.area, ids: i.ids, problem: i.problem, investigateNext: i.investigateNext })) : undefined,
    };
    setAnalyses((a) => [...a, snap]);
    store.saveAnalysis(snap).catch(() => setToast("Couldn't save this analysis run."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, full, runNonce]);

  const loadSample = useCallback((id: keyof typeof SAMPLES) => ingest(SAMPLES[id].csv, `${id}.csv`, SAMPLES[id].label, id), [ingest]);
  const loadFile = useCallback(async (file: File) => {
    const text = await file.text();
    try { ingest(text, file.name, file.name.replace(/\.csv$/i, ""), null); setToast(`Loaded ${file.name}`); }
    catch (e) { setToast(`Couldn't read ${file.name}: ${(e as Error).message}`); }
  }, [ingest]);
  const setMapping = useCallback((m: FieldMapping) => { setMappingState(m); setAi(null); setRanAt(new Date().toISOString()); setRunNonce((n) => n + 1); }, []);
  const rerun = useCallback(() => { setRanAt(new Date().toISOString()); setRunNonce((n) => n + 1); setToast("Analysis re-run on the current dataset."); }, []);

  const saveSettings = useCallback(async (s: Settings) => {
    const next = { ...s, updatedAt: new Date().toISOString() };
    setSettings(next); setRanAt(new Date().toISOString()); setRunNonce((n) => n + 1);
    await store?.saveSettings(next).catch(() => setToast("Couldn't save instructions."));
  }, [store]);

  const pushHistory = useCallback(async (h: Omit<HistoryEntry, "id" | "at">) => {
    const entry: HistoryEntry = { ...h, id: newId(), at: new Date().toISOString(), datasetName: datasetLabel };
    setHistory((x) => [...x, entry]);
    await store?.addHistory(entry);
  }, [store, datasetLabel]);

  const review: Ctx["review"] = useCallback(async (issue, patch) => {
    const prev = issue.decision;
    const cur = { priority: issue.finalPriority, name: issue.finalName, area: issue.finalArea };
    const next = { priority: patch.priority ?? cur.priority, name: (patch.name ?? cur.name).trim() || issue.name, area: (patch.area ?? cur.area).trim() || issue.area };
    const modified = next.priority !== issue.priority || next.name !== issue.name || next.area !== issue.area;
    const note = (patch.note ?? "").trim();
    const d: Decision = {
      issueKey: issue.key, status: modified ? "modified" : "approved",
      priority: next.priority !== issue.priority ? next.priority : undefined,
      name: next.name !== issue.name ? next.name : undefined,
      area: next.area !== issue.area ? next.area : undefined,
      note: note || prev?.note,
      systemPriority: issue.priority, systemName: issue.name, systemArea: issue.area,
      feedbackIds: issue.ids, updatedAt: new Date().toISOString(),
    };
    // strip undefined for the JSON store
    const clean = JSON.parse(JSON.stringify(d)) as Decision;
    setDecisions((xs) => [...xs.filter((x) => x.issueKey !== issue.key), clean]);
    try {
      await store?.saveDecision(clean);
      const base = { issueKey: issue.key, issueName: next.name, note };
      let wrote = false;
      if (next.priority !== cur.priority) { await pushHistory({ ...base, field: "priority", systemValue: `${issue.priority} priority`, before: `${cur.priority} priority`, after: `${next.priority} priority` }); wrote = true; }
      if (next.name !== cur.name) { await pushHistory({ ...base, field: "name", systemValue: issue.name, before: cur.name, after: next.name }); wrote = true; }
      if (next.area !== cur.area) { await pushHistory({ ...base, field: "area", systemValue: issue.area, before: cur.area, after: next.area }); wrote = true; }
      if (patch.approve) { await pushHistory({ ...base, field: "approval", systemValue: `${issue.priority} priority`, before: issue.reviewState === "system" ? "Unreviewed" : "Reviewed", after: modified ? `Approved with changes (${next.priority})` : `Approved as recommended (${next.priority})` }); wrote = true; }
      if (!wrote && note) await pushHistory({ ...base, field: "note", systemValue: `${issue.priority} priority`, before: prev?.note ?? "—", after: "Note added" });
      setToast(patch.approve && !modified ? "Recommendation approved." : "Review saved.");
    } catch { setToast("Couldn't save the review. Check your access to this workspace."); }
  }, [store, pushHistory]);

  const resetReview: Ctx["resetReview"] = useCallback(async (issue, note) => {
    setDecisions((xs) => xs.filter((x) => x.issueKey !== (issue.decision?.issueKey ?? issue.key)));
    await store?.deleteDecision(issue.decision?.issueKey ?? issue.key);
    await pushHistory({ issueKey: issue.key, issueName: issue.name, field: "reset", systemValue: `${issue.priority} priority`, before: `${issue.finalPriority} priority · “${issue.finalName}”`, after: "Back to system recommendation", note });
    setToast("Reset to the system recommendation.");
  }, [store, pushHistory]);

  const runAi = useCallback(async () => {
    if (!ds || !full) return;
    const sample = await getSample();
    if (!sample) { setAiState({ status: "unavailable", message: "Claude-assisted clustering runs when this workspace is opened in Claude. The rules engine is active." }); return; }
    aiCtl.current = new AbortController();
    setAiState({ status: "running" });
    try {
      const rep = await runAiClustering(ds, settings.instructions, decisions, aiCtl.current.signal);
      const rulesFull = analyze(ds, settings.weights, EMPTY_FILTERS);
      const clusters = alignKeys(rep.clusters, rulesFull.issues.map((i) => ({ key: i.key, ids: i.ids })));
      setAi({ clusters, report: rep, hash: ds.hash });
      setRanAt(new Date().toISOString()); setRunNonce((n) => n + 1);
      setAiState({ status: "idle" });
      setToast(`Claude grouped the comments into ${clusters.length} issues. Metrics recomputed from the data.`);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "cancelled") { setAiState({ status: "idle" }); return; }
      const msg = err.code === "not_granted" || err.code === "sampling_disabled" ? "Claude access wasn't granted for this page. The rules engine is still active."
        : err.code === "rate_limited" ? "Claude is rate-limited right now. Try again in a few minutes."
        : err.code === "invalid_json" || err.code === "empty" ? "Claude's reply couldn't be used. Try again, or simplify the instructions."
        : `Claude-assisted clustering failed${err.message ? `: ${err.message}` : ""}.`;
      setAiState({ status: "error", message: msg });
    }
  }, [ds, full, settings, decisions]);

  const value: Ctx = {
    store, raw, mapping, ds, dsError, datasetLabel, sampleId, settings, filters, setFilters,
    analysis, full, issues, allIssues, decisions, history, analyses, ranAt, view, setView,
    selected, select: (k, go = true) => { setSelected(k); if (go && k) setView("evidence"); },
    loadSample, loadFile, setMapping, rerun, saveSettings, review, resetReview,
    ai, aiState, runAi, cancelAi: () => aiCtl.current?.abort(), clearAi: () => { setAi(null); setRanAt(new Date().toISOString()); setRunNonce((n) => n + 1); },
    toast, setToast,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

function history_replace(v: View) {
  if (location.hash.slice(1) !== v) history.replaceState(null, "", `#${v}`);
}
