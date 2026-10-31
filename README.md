# 000911 · R5: StoreGrid, the Voice-of-Store Engine

Team InnoForge (000911), problem R5. Turns multilingual store feedback into a routed weekly action list for Saffron Retail's head office:
every record gets an issue type, severity and actionable flag; a causal detector flags issues that are
rising at one store before they go chain-wide; each region gets a one-page weekly brief.

## What it does

| Output | Where | Status |
|---|---|---|
| Label for every feedback record (issue type, severity, actionable) | `submission/R5_predictions.csv` | Implemented |
| Weekly emerging-issue flags, computed as-of each Sunday (no future data) | `submission/R5_emerging_flags.csv`, `FULL_CODE/nlp/detector.py` | Implemented |
| One-page brief per region: top 5 issues, quotes, affected stores, trend arrow, owner | `FULL_CODE/nlp/brief.py` | Implemented (shown in the app under Weekly briefs, downloadable as HTML) |
| Operations dashboard: overview, feedback list, second-look queue, trends, weekly briefs, data import (CSV, Excel .xlsx, JSON) | `FULL_CODE/web` + `FULL_CODE/api` | Implemented, runs on the R5 stores when the demo slice is uploaded |
| De-duplicating the same incident across channels (stretch goal) | n/a | **Not implemented** |
| WhatsApp / ticketing integrations | n/a | **Not implemented** |

**Routing and escalation rule.** The owner comes from the taxonomy (Store Ops, Supply Chain, Merchandising,
Digital, HR). Escalate today when severity is high/critical (safety, allergen, hygiene, misconduct are high by
policy), the issue hits 3+ stores in a region, or the detector raised an emerging flag; otherwise it goes
to the owner's weekly queue.

## How to run

Python 3.12 (the pinned pandas needs 3.11 or newer), Node 20+.

```bash
# 1. Put the pack's data files in FULL_CODE/data/ (feedback.csv, feedback_labels_train.csv, store_master.csv,
#    issue_taxonomy.csv, week_calendar.csv). They are not committed.
cd FULL_CODE/nlp && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd ../..

# 2. Reproduce one week of flags exactly as the jury would (command from submission/detector_cmd.txt)
python FULL_CODE/nlp/detector.py --feedback FULL_CODE/data/feedback.csv --as-of 2026-07-13 --out week.csv

# 3. Rebuild all submission files (about 4 minutes: one model per distinct set of labels, 14 for 26 weeks)
python FULL_CODE/nlp/detector.py --feedback FULL_CODE/data/feedback.csv

# 4. Regional briefs (HTML, one per region, latest week by default)
python FULL_CODE/nlp/brief.py --feedback FULL_CODE/data/feedback.csv \
  --predictions submission/R5_predictions.csv --flags submission/R5_emerging_flags.csv --out-dir FULL_CODE/web/public/briefs
#    the dashboard reads them from there (Weekly briefs page)

# 5. Dashboard demo: NLP service + API + web together
python FULL_CODE/nlp/make_demo_csv.py --feedback FULL_CODE/data/feedback.csv --weeks 1 --shift-to-today --out demo_slice.csv
cp FULL_CODE/api/.env.example FULL_CODE/api/.env
(cd FULL_CODE/api && npm ci && (cd ../web && npm ci) && node scripts/start-dev.js)   # the entry point
#    then upload demo_slice.csv on the "Import data" page (about 40 s for 1,280 rows)
#    open http://localhost:5173
```

Environment variables are in `FULL_CODE/api/.env.example` (ports, DB, upload limits) and
`FULL_CODE/web/.env.example`. The NLP service also reads `STOREGRID_DATA_DIR` and `STOREGRID_REVIEW_BELOW`. The API logs structured JSON (pino); set `LOG_LEVEL` to change verbosity.
No API keys are used; nothing leaves the machine.

## How to run the tests

```bash
cd FULL_CODE/nlp && python -m pytest -q          # 54 tests: classifier, detector, API, brief
cd ../api && npm test                            # 107 API tests; 1 is a marked to-do (see Limitations)
```

`npm test` starts the classifier service itself (unless `NLP_SERVICE_URL` already answers), so it needs the
Python setup from "How to run" and the pack data in `FULL_CODE/data/`. It stops the service when the tests end.

Lint and format checks:

```bash
ruff check FULL_CODE/nlp && ruff format --check FULL_CODE/nlp     # settings: FULL_CODE/nlp/ruff.toml
(cd FULL_CODE/api && npm run lint && npm run format:check)       # oxlint + Prettier
(cd FULL_CODE/web && npx oxlint src && npm run format:check)
```

## Architecture

```
feedback.csv ─► ml_classifier.py  (TF-IDF char+word n-grams → 3 linear SVMs; policy severity floor applied)
                    │                      │
                    ▼                      ▼
             detector.py             main.py (FastAPI /classify)  ◄── api (Express, SQLite/Postgres) ◄── web (React)
   per-week causal flags                 │
   (z-score vs own 8-week history,       ▼
    policy-weighted, ≤3 flags/week)   brief.py → regional HTML briefs
```

* **Causal by construction.** `--as-of W` keeps rows created before the next Monday, and trains the classifier
  only on labelled rows inside that window. The full run loops `--as-of` week by week, so the submitted flags file is exactly
  what `detector_cmd.txt` reproduces. We checked that a run on a disguised copy (random ids, dates shifted 8 weeks) gives
  identical flags.
* **Store attribution.** Records without `store_id` are attributed from the locality named in the text, using the same
  rule as the official evidence check.
* **Flag budget.** At most 3 flags per week. Candidates need at least 2 reports and a z-score of 2.5 against the store's own
  8-week history; they are ranked by how surprising the count is for that store's size (Poisson tail against the larger of
  its own average and its footfall share of the chain-wide rate), doubled for issue types that are high by policy.

## AI usage

* **Classifier:** scikit-learn TF-IDF (character 2–5-grams + word 1–2-grams) with linear SVMs, trained only on the
  3,000 public labels. Character n-grams absorb the typos and code-mixing (Hinglish, transliterated Tamil/Marathi) with no
  language-specific code. Severity is the model's prediction raised to the taxonomy's policy floor.
* **Held-out check (train weeks 1–9, test weeks 10–13, 957 records):** classification 0.907 (macro-F1 0.897,
  severity 0.916, actionable 0.920) versus 0.569 for the earlier hand-written regex rules, which remain in the repo as the
  fallback and baseline. Of records marked actionable, 89.4% truly were; of those that were also high/critical, 90.6%.
* **No LLM or external API** at run time. Confidence is a margin-based score, not a calibrated probability; below 0.7 the
  record goes to the review queue (about 57% accurate below that line, 97% above, on held-out data).
* **AI coding assistants used:** Claude Code (Anthropic) for implementation help and review.

## Pre-built and third-party code

* **Before Day 1 (outline only):** the project skeleton: the React dashboard shell and its page layout, the Express
  API folder structure, and the first keyword-rule classifier with mock sample data. The team wrote these for this
  hackathon's online selection round (Round 1 build, 17 October 2026), before Day 1. The mock data and keyword rules
  were later replaced (see below).
* **Built during the hackathon (the core system):** the trained classifier (`ml_classifier.py`), the FastAPI service
  that serves it, the per-week causal detector, the regional briefs, the demo-slice builder, the import and feedback
  flow on real R5 data, the in-app weekly briefs, and the tests.
* Libraries: pandas, numpy, scikit-learn, FastAPI (Python); Express, multer, csv-parser, exceljs (API); React, Vite,
  Tailwind (web). Exact versions are in `requirements.txt` and the `package-lock.json` files. Licence: MIT (see `LICENSE`).
* Not included in this zip: editor/agent tooling folders and internal planning notes.

## Limitations and known issues

* The score on the hidden split is unknown. Lead time was verified on one public incident only (flagged 2 weeks before the
  naive detector). Flag precision on the public weeks is low (11%). In weeks 14 to 26 the detector already uses the full
  3-flags-a-week budget, so raising it would trigger the flood penalty.
* Rare issue types have 12–20 held-out examples each, so their per-class F1 is noisy.
* The dashboard's own priority score is separate from the model's severity; the brief and the submission use the model's.
* `npm run seed` loads the original demo stores and sample issues, not the R5 data; use the import page instead.
  Settings still lists Hindi as unsupported although the model handles Hinglish.
* No login or access control. Run it locally or behind a private network only.
* Off-topic English text can get a confident label (the to-do API test shows one such case).
* Uploading the full 40k-row file through the UI is not supported (5,000-row cap); use the detector CLI for that.
* Excel import reads `.xlsx` only. Legacy `.xls` files get a clear message asking for `.xlsx` or `.csv`.
