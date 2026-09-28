// Shared types for the FlowPilot feedback pipeline.

export type FieldRole =
  | "id" | "account" | "date" | "comment" | "rating" | "segment" | "plan" | "acv"
  | "tenure" | "area" | "usage" | "canceled" | "churnRisk" | "escalation" | "release"
  | "source" | "sentiment" | "resolution" | "action" | "outcome" | "ltv";

export type FieldMapping = Partial<Record<FieldRole, string>>; // role -> source column name

export interface RawDataset {
  name: string;
  columns: string[];              // non-empty columns in file order
  rows: Record<string, string>[]; // raw string cells keyed by column
  droppedColumns: string[];       // blank-header or all-empty columns
  parseWarnings: string[];
}

export type Polarity = "problem" | "praise";

/** One normalized feedback record. `raw` keeps every original cell so nothing is lost. */
export interface FeedbackRecord {
  id: string;            // feedback id (or generated row id "row-N")
  row: number;           // 1-based data row in the source file
  text: string;          // verbatim comment, untouched
  account?: string;
  date?: string;
  rating?: number;       // original scale
  rating5?: number;      // normalized to 1–5
  segment?: string;
  plan?: string;
  acv?: number;
  tenure?: number;
  area?: string;
  usage?: string;
  canceled?: boolean;
  churnRisk?: "High" | "Medium" | "Low";
  escalated?: boolean;
  release?: string;
  source?: string;
  sentiment?: string;
  resolution?: string;
  action?: string;
  outcome?: string;
  ltv?: number;
  polarity: Polarity;
  polarityReason: string;
  raw: Record<string, string>;
}

export interface NormalizedDataset {
  name: string;
  hash: string;
  mapping: FieldMapping;
  records: FeedbackRecord[];
  ratingMax?: number;
  columns: string[];
  droppedColumns: string[];
  warnings: string[];
}

export type Grade = "High" | "Medium" | "Low" | "N/A";
export type Priority = "High" | "Medium" | "Lower";

export interface Signal {
  key: "frequency" | "severity" | "customer" | "business" | "evidence";
  label: string;
  grade: Grade;
  value: string;        // headline measure, e.g. "1.5 / 5"
  detail: string;       // how it was measured
}

export interface IssueMetrics {
  count: number;
  share: number;                 // of problem comments in scope
  uniqueAccounts: number | null;
  duplicates: number;            // exact repeats (same account + same text)
  avgRating: number | null;      // original scale
  avgRating5: number | null;
  ratingMax?: number;
  escalations: number | null;
  cancellations: number | null;
  canceledAccounts: number | null;
  highChurn: number | null;
  mediumChurn: number | null;
  acvExposure: number | null;    // sum of max ACV per unique account
  medianAcv: number | null;
  negativeOutcomes: { label: string; count: number }[];
  segments: { name: string; count: number }[];
  plans: { name: string; count: number }[];
  sources: { name: string; count: number }[];
  releases: { name: string; count: number }[];
  dateRange: [string, string] | null;
  cancelMentions: number;        // comment text mentions cancel/churn (language only)
  themeConsistency: number;      // share of comments whose own best theme matches the issue theme
}

export interface Issue {
  key: string;           // stable key used to carry human review across runs
  themeId: string;
  name: string;          // system-generated name
  area: string;          // system-assigned product area / category
  ids: string[];         // feedback ids in this issue
  metrics: IssueMetrics;
  signals: Signal[];
  score: number;         // 0–1 weighted signal score (transparent)
  priority: Priority;    // system priority
  priorityCapped?: string;
  confidence: "High" | "Medium" | "Low";
  confidenceWhy: string;
  rationale: string;     // why this priority
  problem: string;       // one-sentence problem statement
  whyItMatters: string;
  customerImpact: string;
  businessSignal: string;
  investigateNext: string;
  concentration: string[];
  quoteIds: string[];    // representative verbatims (ids into dataset)
  aiDrafted?: boolean;   // problem/investigate text drafted by Claude
  freqRank: number;
  priorityRank: number;
}

export interface CheckResult {
  id: "evidence" | "metrics" | "fabrication" | "missing" | "consistency";
  label: string;
  pass: boolean;
  detail: string;
  failures: string[];
}

export interface DataNote { kind: "info" | "warn"; text: string; }

export interface AnalysisResult {
  engine: "rules" | "claude";
  ranAt: string;
  scopeCount: number;
  problemCount: number;
  praiseCount: number;
  issues: Issue[];               // sorted by priority rank
  praiseByArea: { area: string; count: number; ids: string[] }[];
  unassignedIds: string[];
  checks: CheckResult[];
  notes: DataNote[];
  available: Record<string, boolean>;
}

export interface Weights {
  frequency: number; severity: number; customer: number; business: number; evidence: number;
  highThreshold: number; mediumThreshold: number;
}

export interface Settings {
  instructions: string;
  weights: Weights;
  updatedAt?: string;
}

export interface Decision {
  issueKey: string;
  status: "approved" | "modified";
  priority?: Priority;
  name?: string;
  area?: string;
  note?: string;
  systemPriority: Priority;
  systemName: string;
  systemArea: string;
  feedbackIds: string[];
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  issueKey: string;
  issueName: string;
  field: "approval" | "priority" | "name" | "area" | "note" | "reset";
  systemValue: string;
  before: string;
  after: string;
  note: string;
  at: string;
  analysisId?: string;
  datasetName?: string;
}

export interface AnalysisSnapshot {
  id: string;
  datasetName: string;
  datasetHash: string;
  rowCount: number;
  engine: "rules" | "claude";
  ranAt: string;
  instructions: string;
  weights: Weights;
  checksPassed: boolean;
  issues: { key: string; name: string; area: string; priority: Priority; count: number; avgRating: number | null; cancellations: number | null; score: number }[];
  aiAssignments?: { key: string; name: string; area: string; ids: string[]; problem: string; investigateNext: string }[];
}
