"""
StoreGrid NLP — Standalone Emerging Incident Detector & Submission Engine
Talent AP Mega Hackathon 2026, Problem R5: Voice-of-Store Engine.

CLI interface:
  --feedback  Path to feedback.csv (possibly truncated by the organisers)
  --as-of     YYYY-MM-DD; any day of the week to flag (normalised to its Monday)
  --out       Output flags CSV to write in --as-of mode

Features:
- Causal temporal cutoff: strictly created_at <= that week's Sunday 23:59:59 (no future leakage).
- Monday-to-Sunday weekly bucketing matching week_calendar.csv.
- Store-level & issue-category-level historical baseline using rolling 8-week window.
- Locality resolver: attributes unassigned feedback (call center transcripts) to stores when
  the text mentions the store's locality (in compliance with evaluator Evidence rules).
- At most 3 flags per week budget enforcement (prevents anti-flooding score penalties).
- Valid operational issue IDs only (IT01-IT30; never NI01-NI03).
- Strict evidence validation: only emits flags with >= 2 valid feedback IDs from that store and week.
- Zero external dependencies: pure Python + pandas/numpy running locally on CPU in seconds.
"""

from __future__ import annotations

import argparse
import logging
import math
import re
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

try:
    from ml_classifier import FeedbackModel
except ImportError:  # scikit-learn missing: fall back to the regex rules, loudly
    FeedbackModel = None

log = logging.getLogger("storegrid.detector")

# ---------------------------------------------------------------------------
# Constants & Taxonomy
# ---------------------------------------------------------------------------

NON_ISSUE = {"NI01", "NI02", "NI03"}
HIGH_SEVERITY_CATEGORIES = {"IT04", "IT06", "IT08", "IT10", "IT16", "IT17", "IT18"}
FLAG_COLS = ["as_of_week_start", "store_id", "issue_type_id", "confidence", "evidence_feedback_ids"]
PRED_COLS = ["feedback_id", "issue_type_id", "severity", "actionable"]

# 33-category classification rules: ordered high-precision cues
# Covering English, Hinglish, Tamil, Marathi, and Telugu vernacular cues
RULES = [
    ("NI03", r"click|subscribe|telegram|crypto|loan|earn \d+|kamao|sambaadhi|kamva|youtube|instagram for"),
    ("IT18", r"allerg|ingredient|label|declare|veg dot"),
    ("IT17", r"worm|insect|keed|puzhu|kide|stone|pathar|dagad|glass piece|kaanch|glass thundu|hair|mudi|metal pin"),
    (
        "IT04",
        r"abus|gaali|shivya|thitt|harass|shout|chilla|kathi|orad|misbehav|badtameez|uddhat|chor\b|thief|thirudan|push|dhakka|thalli",
    ),
    ("IT10", r"freez|frzr|chiller|melt|pighal|urugi|vitalun|thaw|not cold|cooling|refrigerator"),
    (
        "IT06",
        r"cockroach|karappan|jhur|\brats?\b|chuh|undir|\beli\b|flies|makkhi|mashya|pest|filthy|unhygien|hygiene|washroom|badbu|naatram|ghaan",
    ),
    ("IT08", r"slip|fisal|vazhuk|ghasar|wire|shock|current|fire exit|wet floor|geela|caution"),
    ("IT09", r"leak|tapak|ozhug|galt|seepage|seelan|ceiling|chhat|roof|drip"),
    ("IT16", r"expir|use-by|fefo"),
    ("IT27", r"debit|deduct|kat gaye|cut aay|katle|upi|payment fail|charged twice"),
    ("IT28", r"refund"),
    ("IT29", r"points|coupon|rewards"),
    ("IT26", r"\bapp\b|otp|website|login|logout|crash"),
    ("IT24", r"missing|wrong item|galat saman|thappana porul|chukicha saaman|substitut|different brand|instead of"),
    ("IT25", r"broken|damag|toot|udanj|futl|crushed|leaked|leaking"),
    ("IT23", r"deliver|slot"),
    ("IT19", r"shelf tag|price tag|shelf price|tag "),
    ("IT20", r"offer|bogo|buy 1|% off|combo|promo|discount"),
    ("IT30", r"scan|twice|double|do baar|rendu dhadava|don vela|wazan|vajan|weight"),
    ("IT12", r"carry bag|paper bag|packing"),
    ("IT13", r"parking|ramp|closed|band kar|opened late|timing"),
    ("IT11", r"\bac\b|lift|escalator|weighing|card machine|lights?\b|printer"),
    ("IT14", r"out of stock|oos|empty|khaali|kaali|rikam|not available|khatam|theern|sampla|restock"),
    ("IT15", r"rotten|stale|sade|azhugi|sadle|baasi|shila|black spot|vegetable|sabzi|bhaji|kaaikari"),
    ("IT21", r"saffron select|saffron kitchen"),
    ("IT22", r"please keep|rakho|vechu kudunga|theva|range|variety"),
    ("IT05", r"salary|sambalam|pagar|weekly off|incentive|uniform"),
    ("IT02", r"absent|understaff|short of staff|no staff|nobody|koi nahi|yaarum illa|konich"),
    ("IT01", r"queue|line|billing|counter|\bq\b|rang\b"),
    ("IT07", r"carton|mess|bikhr|kalanju|pasara|trolley|godown"),
    ("IT03", r"staff|attitude|ignore|shrug"),
    ("NI01", r"good|great|nice|love|best|thank|accha|nalla|chhan|happy|fresh|excellent"),
]
COMPILED_RULES = [(t, re.compile(p, re.IGNORECASE)) for t, p in RULES]
CRITICAL_WORDS = re.compile(
    r"\b(?:hospital|sick|poisoning|injur|stitch|doctor|reaction|rashes|beemar|vaanthi|aajari|harass|fire|shock)\b",
    re.IGNORECASE,
)


def classify_text(text: str) -> str:
    """Assigns one of 33 categories (IT01..IT30, NI01..NI03) based on regex cues."""
    text_str = str(text or "")
    for cat_id, rx in COMPILED_RULES:
        if rx.search(text_str):
            return cat_id
    return "NI02"


def label_feedback(fb: pd.DataFrame, tax: pd.DataFrame | None = None, model: Any = None) -> pd.DataFrame:
    """
    Labels feedback DataFrame with issue_type_id, severity, and actionable flag.
    Uses the trained model when given; otherwise the regex rules (kept as a fallback and baseline).
    """
    if fb.empty:
        return pd.DataFrame(columns=["feedback_id", "issue_type_id", "severity", "actionable"])

    fb = fb.copy()
    text = fb["text"].fillna("").astype(str)
    if model is not None:
        fb[["issue_type_id", "severity", "actionable"]] = model.predict(text)
        return fb

    fb["issue_type_id"] = text.map(classify_text)

    # Determine severity
    if tax is not None and "policy_severity_floor" in tax.columns:
        floor = fb["issue_type_id"].map(tax["policy_severity_floor"]).fillna("low")
    else:
        floor = pd.Series("low", index=fb.index)

    sev = np.where(floor == "high", "high", "medium")
    sev = np.where(fb["issue_type_id"].isin(NON_ISSUE), "low", sev)
    sev = np.where(text.str.contains(CRITICAL_WORDS) & (floor == "high"), "critical", sev)
    fb["severity"] = sev

    # Actionable: 0 for non-issues, 1 for operational issues with substantive length (>40 chars)
    fb["actionable"] = ((~fb["issue_type_id"].isin(NON_ISSUE)) & (text.str.len() > 40)).astype(int)
    return fb


def train_model(fb: pd.DataFrame, labels_path: Path, tax: pd.DataFrame) -> Any:
    """
    Trains the classifier on the public labelled sample, restricted to the feedback rows passed in.
    Callers pass only rows up to the as-of Sunday, so a flag never depends on later labels.
    Exits if scikit-learn is missing; returns None (regex rules) only if too few labels remain.
    """
    if FeedbackModel is None:
        # A silent fallback would change every label and flag, so stop instead.
        raise SystemExit("scikit-learn is required: pip install -r FULL_CODE/nlp/requirements.txt")
    train = pd.read_csv(labels_path).merge(fb[["feedback_id", "text"]], on="feedback_id")
    if train["issue_type_id"].nunique() < 2:
        log.warning("too few labelled rows up to this week; falling back to regex rules")
        return None
    return FeedbackModel(tax).fit(train["text"], train)


# ---------------------------------------------------------------------------
# Locality & Store Attribution
# ---------------------------------------------------------------------------


def extract_localities(store_master_df: pd.DataFrame) -> dict[str, str]:
    """
    Extracts lowercase locality name from store_name matching the official evaluator:
    store_name.split(' ', 2)[2].lower() -> store_id.
    """
    if store_master_df.empty or "store_name" not in store_master_df.columns:
        return {}
    loc_map = {}
    for s, name in zip(store_master_df["store_id"], store_master_df["store_name"]):
        parts = str(name).split(" ", 2)
        if len(parts) > 2:
            loc_map[parts[2].strip().lower()] = str(s).strip()
    return loc_map


def resolve_store_id(row: pd.Series, loc_map: dict[str, str]) -> str | None:
    """Returns store_id if present; else attributes via locality in text."""
    s = row.get("store_id")
    if pd.notna(s):
        s_str = str(s).strip()
        if s_str and s_str.lower() != "nan":
            return s_str
    txt = str(row.get("text", "")).lower()
    for loc, sid in loc_map.items():
        if loc in txt:
            return sid
    return None


# ---------------------------------------------------------------------------
# Emerging Incident Detection
# ---------------------------------------------------------------------------


def poisson_tail(count: float, rate: float) -> float:
    """P(X >= count) for X ~ Poisson(rate): how surprising `count` reports are if the store were at its usual level."""
    k = int(count)
    below = sum(math.exp(-rate + j * math.log(rate) - math.lgamma(j + 1)) for j in range(k))
    return max(1.0 - below, 1e-12)


def detect_emerging_incidents(
    labeled_fb: pd.DataFrame,
    weeks: list[str],
    emit_weeks: list[str],
    tax: pd.DataFrame | None = None,
    names: dict[str, str] | None = None,
    loc_map: dict[str, str] | None = None,
    z_threshold: float = 2.5,
    min_count: int = 2,
    max_flags_per_week: int = 3,
    high_severity_weight: float = 2.0,
    footfall: pd.Series | None = None,
) -> pd.DataFrame:
    """
    Detects emerging operational issues using a rolling historical z-score,
    ranking candidates by policy-weighted risk score: z * severity_weight.
    Strictly enforces:
    - Only operational issue IDs (IT01..IT30; never NI01..NI03).
    - At most max_flags_per_week (default 3) per week.
    - >= 2 valid feedback evidence IDs per flag.
    - With `footfall` (avg weekly visitors per store), the expected count is the larger of the store's own recent
      average and its footfall share of the chain-wide rate, so big stores are not flagged for just being big.
    - Deterministic tie-breaking by rank_score desc, store name asc, issue_type_id asc.
    """
    if labeled_fb.empty:
        return pd.DataFrame(columns=FLAG_COLS)

    fb = labeled_fb.copy()
    if "created_at" not in fb.columns:
        return pd.DataFrame(columns=FLAG_COLS)

    # Weekly bucketing: Monday start
    fb["week_start"] = pd.to_datetime(fb["created_at"]).dt.to_period("W-SUN").dt.start_time.dt.strftime("%Y-%m-%d")

    # Attribute store_id (including locality fallback for missing store_ids)
    if loc_map:
        fb["store_id_resolved"] = fb.apply(lambda r: resolve_store_id(r, loc_map), axis=1)
    else:
        fb["store_id_resolved"] = fb["store_id"].dropna().astype(str)

    # Filter to operational issues and resolvable stores only
    issues = fb[(~fb["issue_type_id"].isin(NON_ISSUE)) & fb["store_id_resolved"].notna()].copy()
    if issues.empty:
        return pd.DataFrame(columns=FLAG_COLS)

    # Build weekly count matrix and evidence feedback ID lists
    counts = (
        issues.groupby(["store_id_resolved", "issue_type_id", "week_start"])
        .size()
        .unstack(fill_value=0)
        .reindex(columns=weeks, fill_value=0)
    )

    evidence_groups = issues.groupby(["store_id_resolved", "issue_type_id", "week_start"])["feedback_id"].apply(
        lambda s: ";".join(sorted(dict.fromkeys(str(x) for x in s if str(x).strip())))
    )

    flags: list[dict[str, Any]] = []
    store_names = names or {}

    for i, w in enumerate(weeks):
        # Need at least 4 historical weeks before flagging, and week must be in emit list
        if i < 4 or w not in emit_weeks:
            continue

        hist = counts.iloc[:, max(0, i - 8) : i]
        cur = counts.iloc[:, i]
        mu = hist.mean(axis=1)
        sd = hist.std(axis=1, ddof=0).clip(lower=1.0)
        z = (cur - mu) / sd

        # Candidate criteria: >= min_count in current week and z >= z_threshold
        keep = (cur >= min_count) & (z >= z_threshold)
        cand = z[keep].reset_index()
        if cand.empty:
            continue

        cand.columns = ["store_id", "issue_type_id", "z"]
        if footfall is not None:
            chain_rate = counts.groupby(level=1).sum().iloc[:, max(0, i - 8) : i].mean(axis=1)
            share = footfall / footfall.sum()
            expected = [
                max(
                    float(mu[(r.store_id, r.issue_type_id)]),
                    float(chain_rate.get(r.issue_type_id, 0.0)) * float(share.get(r.store_id, 1 / len(share))),
                    0.05,
                )
                for r in cand.itertuples()
            ]
            cand["surprise"] = [
                -math.log10(poisson_tail(cur[(r.store_id, r.issue_type_id)], lam))
                for r, lam in zip(cand.itertuples(), expected)
            ]
        else:
            cand["surprise"] = cand["z"]
        cand["store_id"] = cand["store_id"].astype(str)
        cand["name"] = cand["store_id"].map(lambda sid: store_names.get(sid, sid))

        # Deterministic sorting: highest z first, ties broken by store name, then issue_type_id
        # Stage 2.2 Policy-weighted risk anomaly ranking
        if tax is not None and "policy_severity_floor" in tax.columns:
            is_high = cand["issue_type_id"].map(tax["policy_severity_floor"]).fillna("low") == "high"
        else:
            is_high = cand["issue_type_id"].isin(HIGH_SEVERITY_CATEGORIES)

        cand["rank_score"] = cand["surprise"] * np.where(is_high, high_severity_weight, 1.0)
        cand = cand.sort_values(
            ["rank_score", "name", "issue_type_id"], ascending=[False, True, True], kind="mergesort"
        )

        week_flags_count = 0
        for r in cand.itertuples():
            key = (r.store_id, r.issue_type_id, w)
            ev_str = evidence_groups.get(key, "")
            ev_list = [x.strip() for x in ev_str.split(";") if x.strip()]

            # Enforce evidence rule: must have >= 2 valid feedback records
            if len(ev_list) < 2:
                continue

            flags.append(
                {
                    "as_of_week_start": w,
                    "store_id": r.store_id,
                    "issue_type_id": r.issue_type_id,
                    "confidence": round(float(min(1.0, r.z / 10)), 3),
                    "evidence_feedback_ids": ";".join(ev_list),
                }
            )
            week_flags_count += 1
            if week_flags_count >= max_flags_per_week:
                break

    return pd.DataFrame(flags, columns=FLAG_COLS)


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------


def parse_args(args: Sequence[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="StoreGrid NLP Standalone Detector & Submission Generator for Talent AP Mega Hackathon R5."
    )
    ap.add_argument(
        "--feedback",
        default=None,
        help="Path to feedback.csv (possibly truncated by the organisers).",
    )
    ap.add_argument(
        "--as-of",
        dest="as_of",
        default=None,
        help="YYYY-MM-DD; any day of the week to flag (normalised to its Monday).",
    )
    ap.add_argument(
        "--out",
        default=None,
        help="Path to output flags CSV in --as-of mode.",
    )
    ap.add_argument(
        "--submission-dir",
        dest="submission_dir",
        default=None,
        help="Directory to write full submission files (R5_predictions.csv, R5_emerging_flags.csv, detector_cmd.txt).",
    )
    return ap.parse_args(args)


def find_reference_file(name: str, feedback_path: Path | None) -> Path:
    """Locates reference files next to feedback.csv, or in FULL_CODE/data when no path was given."""
    candidates = []
    if feedback_path is not None:
        parent = feedback_path.resolve().parent
        candidates.extend([parent / name, parent / "data" / name])
    candidates.append(Path(__file__).resolve().parent.parent / "data" / name)

    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError(f"Reference file {name} not found. Searched in: {[str(c) for c in candidates]}")


def main(cli_args: Sequence[str] | None = None) -> int:
    args = parse_args(cli_args)

    fb_path_str = args.feedback
    if not fb_path_str:
        # Default feedback path
        fb_candidate = find_reference_file("feedback.csv", None)
        fb_path = fb_candidate
    else:
        fb_path = Path(fb_path_str)

    if not fb_path.exists():
        print(f"Error: Feedback file not found at {fb_path}", file=sys.stderr)
        return 1

    # Load reference data
    try:
        tax_path = find_reference_file("issue_taxonomy.csv", fb_path)
        cal_path = find_reference_file("week_calendar.csv", fb_path)
        sm_path = find_reference_file("store_master.csv", fb_path)
        labels_path = find_reference_file("feedback_labels_train.csv", fb_path)
    except FileNotFoundError as e:
        print(f"Error finding reference data: {e}", file=sys.stderr)
        return 1

    tax = pd.read_csv(tax_path).set_index("issue_type_id")
    weeks = pd.read_csv(cal_path)["week_start"].tolist()
    sm = pd.read_csv(sm_path)
    names = dict(zip(sm["store_id"], sm["store_name"]))
    loc_map = extract_localities(sm)
    footfall = sm.set_index("store_id")["avg_weekly_footfall"]

    # Load feedback
    fb = pd.read_csv(fb_path, dtype={"store_id": str, "feedback_id": str})
    if fb.empty:
        print("Feedback dataset is empty.")
        if args.as_of:
            out_path = Path(args.out or "R5_emerging_flags_asof.csv")
            pd.DataFrame(columns=FLAG_COLS).to_csv(out_path, index=False)
        return 0

    # Handle --as-of mode: single week flags with strict temporal cutoff
    if args.as_of:
        monday = (pd.Timestamp(args.as_of) - pd.Timedelta(days=pd.Timestamp(args.as_of).weekday())).normalize()
        cutoff = monday + pd.Timedelta(days=7)  # Strictly before next Monday 00:00:00 = Sunday 23:59:59
        fb_cutoff = fb[pd.to_datetime(fb["created_at"]) < cutoff]
        labeled = label_feedback(fb_cutoff, tax, train_model(fb_cutoff, labels_path, tax))
        monday_str = monday.strftime("%Y-%m-%d")

        flags = detect_emerging_incidents(
            labeled,
            weeks=weeks,
            emit_weeks=[monday_str],
            tax=tax,
            names=names,
            loc_map=loc_map,
            z_threshold=2.5,
            min_count=2,
            max_flags_per_week=3,
            high_severity_weight=2.0,
            footfall=footfall,
        )

        out_path = Path(args.out or "R5_emerging_flags_asof.csv")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        flags.to_csv(out_path, index=False)
        print(f"as-of {monday.date()}: wrote {out_path} ({len(flags)} flags, {len(fb_cutoff)} rows used)")
        return 0

    # Full submission generation mode: flags are produced week by week exactly as --as-of would,
    # so the submitted flags file matches what detector_cmd.txt reproduces.
    created = pd.to_datetime(fb["created_at"])
    label_times = pd.to_datetime(
        pd.read_csv(labels_path).merge(fb[["feedback_id", "created_at"]], on="feedback_id")["created_at"]
    )
    labelled_by_label_count: dict[int, pd.DataFrame] = {}

    def labelled_as_of(cutoff: pd.Timestamp) -> pd.DataFrame:
        """All rows labelled by the model trained on labels before `cutoff`. Weeks that see the same labels share one model."""
        usable = int((label_times < cutoff).sum())
        if usable not in labelled_by_label_count:
            model = train_model(fb[created < cutoff], labels_path, tax)
            labelled_by_label_count[usable] = label_feedback(fb, tax, model)
        return labelled_by_label_count[usable]

    flag_parts = []
    for week in weeks:
        cutoff = pd.Timestamp(week) + pd.Timedelta(days=7)
        week_labeled = labelled_as_of(cutoff)[created < cutoff]
        flag_parts.append(
            detect_emerging_incidents(
                week_labeled,
                weeks=weeks,
                emit_weeks=[week],
                tax=tax,
                names=names,
                loc_map=loc_map,
                z_threshold=2.5,
                min_count=2,
                max_flags_per_week=3,
                high_severity_weight=2.0,
                footfall=footfall,
            )
        )
    flags = pd.concat(flag_parts, ignore_index=True) if flag_parts else pd.DataFrame(columns=FLAG_COLS)
    labeled = labelled_as_of(created.max() + pd.Timedelta(days=1))

    # Determine submission output directories
    target_dirs = []
    if args.submission_dir:
        target_dirs.append(Path(args.submission_dir))
    else:
        # Standard location: submission/ at the top of the project (parent of FULL_CODE/)
        target_dirs.append(Path(__file__).resolve().parents[2] / "submission")

    cmd_text = "python FULL_CODE/nlp/detector.py --feedback {feedback} --as-of {asof} --out {out}\n"

    for out_dir in target_dirs:
        out_dir.mkdir(parents=True, exist_ok=True)
        labeled[PRED_COLS].to_csv(out_dir / "R5_predictions.csv", index=False)
        flags[FLAG_COLS].to_csv(out_dir / "R5_emerging_flags.csv", index=False)
        (out_dir / "detector_cmd.txt").write_text(cmd_text, encoding="utf-8")
        print(f"Wrote submission files to {out_dir}:")
        print(f"  - R5_predictions.csv ({len(labeled)} rows)")
        print(f"  - R5_emerging_flags.csv ({len(flags)} flags)")
        print("  - detector_cmd.txt")

    return 0


if __name__ == "__main__":
    sys.exit(main())
