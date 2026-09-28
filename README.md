# FlowPilot Customer Feedback Workspace

A lightweight internal tool that turns raw customer feedback into evidence-backed product priorities. It answers **"What should I investigate first?"**, not just "what do customers complain about most?"

**Customer feedback → prioritized problems → evidence → human review → reusable product insight**

The FlowPilot Customer Feedback Dataset (90 comments, 19 columns) loads as the default demo. A second bundled sample holds the same comments with no metadata, so you can see what the basic prompt had to work with (Build #0) and why richer metadata changes the ranking.

## Run it

```bash
npm install
npm run dev        # local dev server
npm run build      # type-check, build a single self-contained HTML file (dist/index.html + dist/flowpilot-workspace.html)
npm test           # unit tests (pipeline, metrics, verbatims, missing metadata, AI guardrails)
npm run e2e        # Playwright end-to-end tests against the built file
```

## What the dataset contains (schema inspection)

`feedback_id, account_id, date, feedback_text, source, customer_segment, plan, annual_contract_value, tenure_months, product_area, rating, usage_level, canceled, churn_risk, support_escalation, release_version, resolution_status, action_taken, outcome_after_action`

Things found while inspecting it, which the app surfaces under **Insights → Data notes**:
- 15 of 90 comments are praise (Onboarding, Collaboration, Templates, Support). They're kept out of the problem ranking and shown under "What customers value".
- 4 comments (F013–F016) repeat an earlier comment from the same account word-for-word. They count toward volume but not toward independent evidence.
- 19 accounts have different contract values on different rows (e.g. SMB-01 is $12,000 on one row and $54,000 on another). ACV exposure uses the highest value per account.
- Some praise rows carry product areas that don't match the text (e.g. "Comments and mentions…" is labeled Templates). The reviewer can recategorize issues.

## Architecture

```
src/
  lib/ingest/parseCsv.ts      1. Data ingestion: CSV → raw rows; drops blank/empty padding columns
  lib/ingest/schema.ts           Field detection: maps any header names onto roles (comment, rating, segment…)
  lib/ingest/normalize.ts     2. Data normalization: typed records; raw cells kept for re-verification
  lib/analysis/polarity.ts    3. Issue identification: problem/request vs. praise (rating, sentiment, wording)
  lib/analysis/themes.ts         Theme lexicon: names, problem statements, research questions from terms present in the comments
  lib/analysis/cluster.ts     4. Issue clustering: product area first, split by theme when a sub-theme is large
  lib/analysis/aiCluster.ts      Optional Claude-assisted clustering (LLM), reconciled and validated
  lib/analysis/prioritize.ts  5. Priority analysis: per-signal metrics, grades, weighted score, caps, confidence
  lib/analysis/narrative.ts      Rationale / why-it-matters text built only from computed metrics
  lib/analysis/evidence.ts    6. Evidence retrieval: representative verbatims chosen by id, never rewritten
  lib/analysis/validate.ts       Evidence checks (re-derived from raw CSV cells)
  lib/analysis/pipeline.ts       Orchestration + filters + data notes
  components/charts.tsx       7. Visualization (hand-built SVG/HTML, theme-aware)
  lib/review/decisions.ts     8. Human review: overlays decisions on system output without erasing it
  lib/storage/store.ts        9. Review history + analyses + settings persistence
  views/                         Overview, Customer Problems, Evidence, Insights, Review History, Analysis Instructions
```

Stack: React 18, TypeScript, Tailwind CSS, Papa Parse, Vite (+ vite-plugin-singlefile). No server: parsing, analysis and validation run in the browser.

## Prioritization methodology

Each issue is graded High / Medium / Low on five signals. Signals the dataset can't measure are marked "No data" and left out of the score. They are never guessed.

| Signal | What it measures | High | Medium | Weight |
|---|---|---|---|---|
| Frequency | Comments as a share of problem comments | ≥ 20% | ≥ 10% | ×0.5 |
| Severity | Average rating (or negative-sentiment share); escalations shown | ≤ 2.0 / 5 | ≤ 2.75 / 5 | ×1 |
| Customer impact | Share from the highest-median-ACV segment, median ACV vs. 75th percentile, paying share | mostly top segment or top-quartile ACV | mostly paying | ×1 |
| Business impact | Cancellations, churn-risk flags, negative outcomes ("Expansion delayed", "Customer still at risk") | 2+ cancellations, ≥ 20% canceled, or ≥ 50% high risk | any early signal | ×1.5 |
| Evidence strength | Independent accounts (repeats removed), sources, theme consistency | ≥ 8 accounts & ≥ 60% consistent | ≥ 4 | ×0.5 |

Score = Σ(weight × grade) / max possible (High = 2, Medium = 1, Low = 0). A score of ≥ 0.62 is **High** and ≥ 0.40 is **Medium**; anything lower is **Lower**. Two caps apply: an issue backed by fewer than 4 independent accounts can't be High, and neither can one scored on frequency alone. Weights and thresholds are editable under Analysis Instructions.

Result on the FlowPilot dataset (rules engine):

| # | Issue | Priority | Comments | Avg rating | Cancellations |
|---|---|---|---|---|---|
| 1 | Salesforce integration reliability | High | 10 | 1.5 | 4 |
| 2 | Mobile login failures (all on release 3.8) | High | 8 | 1.5 | 0 |
| 3 | Permissions and admin controls | High | 8 | 2.4 | 0 (2 × "Expansion delayed") |
| 4 | Billing and invoicing | Medium | 5 | 1.8 | 0 |
| 5 | Performance at scale | Medium | 6 | 2.5 | 0 |
| 6 | Setup and onboarding friction | Medium | 4 | 2.3 | 0 |
| 7 | Reporting guidance: which metrics matter | Lower | 10 | 3.4 | 0 |
| 8 | Dashboard customization | Lower | 24 | 2.8 | 0 (all Free plan, $0 ACV) |

Dashboard customization is the most-mentioned problem, but it ranks last. Salesforce ranks first.

## Implementation decisions

- **Deterministic core, optional LLM.** The default analysis is a transparent rules engine, so the demo works immediately and every step can be explained and tested. The spec's LLM step is **Refine with Claude** (Analysis Instructions). It sends the editable instructions, earlier reviewer corrections and the problem comments to Claude. Claude returns groupings, names, one-sentence problem statements and research questions. Claude never supplies numbers or quotes. Unknown ids are rejected, and a comment claimed by two groups goes to the first. Every metric is then recomputed and the evidence checks re-run. Claude's issues are matched to earlier issue keys by comment overlap, so reviews carry over. This runs through the Claude artifact runtime (`sample` capability); outside Claude the button explains it's unavailable.
- **Product area is the primary grouping** when present, because it's the PM's own taxonomy. The theme lexicon names each group and splits off a sub-theme with ≥ 3 comments and ≥ 25% of the area. Without a product area, comments are grouped by theme.
- **Filters recompute the analysis on the subset**, so frequency shares and thresholds refer to what's on screen. A banner says so. The priority filter only hides issues.
- **Human decisions are overlays.** System output is never overwritten: every view shows the system recommendation next to the reviewer's decision. Decisions are keyed by issue key and matched to later runs by key or ≥ 50% comment overlap. That's how corrections are reused as context in future analyses.
- **Persistence.** Inside Claude, settings, decisions, review history and analysis snapshots go to the artifact's shared database, so a team sees one history. Anywhere else (local dev, tests) they fall back to browser storage. Uploaded CSV contents are not stored. Only analysis summaries are.
- **"Business impact" on the chart** is a combined impact score (severity, customer impact and business impact grades with their weights). Frequency is excluded so the two axes are independent.
- **Comments-only data** still works. Severity, customer impact and business impact show "No data", nothing is claimed, and every issue is capped at Medium. Text that mentions canceling is reported as language, not as verified cancellation data.

## Testing

- `tests/unit/pipeline.test.ts` checks the following. Salesforce metrics match an independent parse of the CSV (10 comments, 1.5 average rating, 4 cancellations). The most frequent issue is not the top priority. Every verbatim is an exact source comment from its own issue. Each comment is counted once. Filters recompute. Decisions overlay correctly. The comments-only file makes no business claims. Odd headers and missing ids are handled. A file with no comment column is rejected. The AI output guardrails hold.
- `tests/e2e/workspace.spec.ts` (Playwright, on the built file) checks the following. The demo loads. Quotes appear in the CSV. Filters change scope. A review (priority change, rename, note, approval) is saved, logged and survives a reload. CSV upload works, including missing metadata and a 3-row file with unfamiliar headers. Instructions save and reset.

## Deploy

The repo includes `.github/workflows/deploy.yml`. Each push to `main` installs dependencies, runs the unit tests, builds the app and publishes it to GitHub Pages. One-time setup: in the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

The build is a single self-contained `dist/index.html`, so any static host works. On Netlify or Vercel, use build command `npm run build` and output directory `dist`.

Outside Claude, two things behave differently:
- Reviews, history and settings are saved in each visitor's own browser, not shared across a team.
- "Refine with Claude" is unavailable. The rules engine does all the analysis.

The FlowPilot CSVs in `src/data/` are bundled into the site. On a public repo or public Pages site, anyone can read them.
