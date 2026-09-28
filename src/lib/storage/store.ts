// Persistence. Inside Claude the workspace uses the artifact's shared database, so
// analyses, reviews and history survive reloads and are shared with the team.
// Opened anywhere else (local dev, tests) it falls back to this browser's storage.
import type { AnalysisSnapshot, Decision, HistoryEntry, Settings } from "../types";

export interface Store {
  kind: "shared" | "local";
  loadSettings(): Promise<Settings | null>;
  saveSettings(s: Settings): Promise<void>;
  loadDecisions(): Promise<Decision[]>;
  saveDecision(d: Decision): Promise<void>;
  deleteDecision(key: string): Promise<void>;
  loadHistory(): Promise<HistoryEntry[]>;
  addHistory(h: HistoryEntry): Promise<void>;
  loadAnalyses(): Promise<AnalysisSnapshot[]>;
  saveAnalysis(a: AnalysisSnapshot): Promise<void>;
  subscribe?(onChange: () => void): () => void;
}

const safeId = (s: string) => s.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_").slice(0, 180) || "x";

/* ---------- local fallback ---------- */
function lsGet<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } }
function lsSet(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }
const P = "flowpilot-ws:";

export function localStore(): Store {
  return {
    kind: "local",
    async loadSettings() { return lsGet<Settings | null>(P + "settings", null); },
    async saveSettings(s) { lsSet(P + "settings", s); },
    async loadDecisions() { return Object.values(lsGet<Record<string, Decision>>(P + "decisions", {})); },
    async saveDecision(d) { const m = lsGet<Record<string, Decision>>(P + "decisions", {}); m[d.issueKey] = d; lsSet(P + "decisions", m); },
    async deleteDecision(key) { const m = lsGet<Record<string, Decision>>(P + "decisions", {}); delete m[key]; lsSet(P + "decisions", m); },
    async loadHistory() { return lsGet<HistoryEntry[]>(P + "history", []); },
    async addHistory(h) { const a = lsGet<HistoryEntry[]>(P + "history", []); a.push(h); lsSet(P + "history", a); },
    async loadAnalyses() { return lsGet<AnalysisSnapshot[]>(P + "analyses", []); },
    async saveAnalysis(x) { const a = lsGet<AnalysisSnapshot[]>(P + "analyses", []); a.push(x); lsSet(P + "analyses", a.slice(-40)); },
  };
}

/* ---------- shared artifact database ---------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function dbStore(db: Db): Store {
  const docs = async (col: string) => {
    const snap = await db.collection(col).get();
    return snap.docs.filter((d: Db) => d.exists).map((d: Db) => d.data());
  };
  return {
    kind: "shared",
    async loadSettings() { const s = await db.doc("workspace/settings").get(); return s.exists ? (s.data() as Settings) : null; },
    async saveSettings(s) { await db.doc("workspace/settings").set(s as unknown as Record<string, unknown>); },
    async loadDecisions() { return (await docs("decisions")) as Decision[]; },
    async saveDecision(d) { await db.doc(`decisions/${safeId(d.issueKey)}`).set(d as unknown as Record<string, unknown>); },
    async deleteDecision(key) { await db.doc(`decisions/${safeId(key)}`).delete(); },
    async loadHistory() { return ((await docs("history")) as HistoryEntry[]).sort((a, b) => a.at.localeCompare(b.at)); },
    async addHistory(h) { await db.doc(`history/${safeId(h.id)}`).set(h as unknown as Record<string, unknown>); },
    async loadAnalyses() { return ((await docs("analyses")) as AnalysisSnapshot[]).sort((a, b) => a.ranAt.localeCompare(b.ranAt)); },
    async saveAnalysis(a) { await db.doc(`analyses/${safeId(a.id)}`).set(a as unknown as Record<string, unknown>); },
    subscribe(onChange) {
      const offs = ["decisions", "history"].map((c) => db.collection(c).onSnapshot(() => onChange(), () => {}));
      return () => offs.forEach((o: () => void) => o());
    },
  };
}

export async function openStore(): Promise<Store> {
  try {
    if (window.claude?.use) {
      const db = await Promise.race([window.claude.use("db"), new Promise((r) => setTimeout(() => r(null), 4000))]);
      if (db) {
        const s = dbStore(db);
        await s.loadSettings(); // probe access
        return s;
      }
    }
  } catch { /* fall through */ }
  return localStore();
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
