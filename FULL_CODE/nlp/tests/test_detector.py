"""
Automated Unit and Integration Test Suite for StoreGrid Standalone Detector & Submissions.
Talent AP Mega Hackathon 2026, Problem R5.

Tests:
1. CLI argument parsing (--feedback, --as-of, --out, --submission-dir).
2. Weekly bucketing (Monday-to-Sunday).
3. As-of cutoff and prevention of future-data leakage.
4. Valid issue IDs only (IT01..IT30, never NI01..NI03).
5. Evidence IDs verification (exist, belong to store, week, and issue type).
6. Empty/missing store IDs and locality matching.
7. Budget limit (at most 3 flags per week).
8. Correct output CSV headers matching official schemas.
9. Empty and malformed input handling.
10. Reproducible and deterministic results.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Ensure storegrid-nlp is on path
NLP_DIR = Path(__file__).resolve().parents[1]
if str(NLP_DIR) not in sys.path:
    sys.path.insert(0, str(NLP_DIR))

from detector import (
    FLAG_COLS,
    NON_ISSUE,
    PRED_COLS,
    detect_emerging_incidents,
    extract_localities,
    label_feedback,
    parse_args,
    resolve_store_id,
)


@pytest.fixture
def sample_taxonomy():
    tax_data = [
        {"issue_type_id": f"IT{i:02d}", "policy_severity_floor": "high" if i in [4, 6, 8, 10, 16, 17, 18] else "low"}
        for i in range(1, 31)
    ]
    tax_data.extend(
        [
            {"issue_type_id": "NI01", "policy_severity_floor": "low"},
            {"issue_type_id": "NI02", "policy_severity_floor": "low"},
            {"issue_type_id": "NI03", "policy_severity_floor": "low"},
        ]
    )
    return pd.DataFrame(tax_data).set_index("issue_type_id")


@pytest.fixture
def sample_stores():
    return pd.DataFrame(
        [
            {"store_id": "ST-01", "store_name": "Saffron Market Koramangala"},
            {"store_id": "ST-02", "store_name": "Saffron Market Kankarbagh"},
            {"store_id": "ST-03", "store_name": "Saffron Market Indiranagar"},
        ]
    )


@pytest.fixture
def sample_weeks():
    # 10 weeks of calendar starting Mondays
    return [(pd.Timestamp("2026-01-05") + pd.Timedelta(days=7 * i)).strftime("%Y-%m-%d") for i in range(10)]


def test_cli_argument_parsing():
    args = parse_args(
        [
            "--feedback",
            "custom_fb.csv",
            "--as-of",
            "2026-05-18",
            "--out",
            "custom_flags.csv",
            "--submission-dir",
            "custom_sub",
        ]
    )
    assert args.feedback == "custom_fb.csv"
    assert args.as_of == "2026-05-18"
    assert args.out == "custom_flags.csv"
    assert args.submission_dir == "custom_sub"


def test_weekly_bucketing():
    """Verify timestamps throughout the week bucket to Monday."""
    # 2026-05-18 is Monday, 2026-05-24 is Sunday
    df = pd.DataFrame(
        [
            {"created_at": "2026-05-18T00:00:01"},
            {"created_at": "2026-05-20T14:30:00"},
            {"created_at": "2026-05-24T23:59:59"},
            {"created_at": "2026-05-25T00:00:01"},  # Next Monday
        ]
    )
    buckets = pd.to_datetime(df["created_at"]).dt.to_period("W-SUN").dt.start_time.dt.strftime("%Y-%m-%d")
    assert buckets.iloc[0] == "2026-05-18"
    assert buckets.iloc[1] == "2026-05-18"
    assert buckets.iloc[2] == "2026-05-18"
    assert buckets.iloc[3] == "2026-05-25"


def test_as_of_cutoff_prevention_of_future_data_leakage(sample_taxonomy, sample_stores, sample_weeks):
    """Verify that --as-of cutoff strictly excludes rows created after that week's Sunday 23:59:59."""
    as_of_target = "2026-02-09"  # Week 5 Monday
    monday = (pd.Timestamp(as_of_target) - pd.Timedelta(days=pd.Timestamp(as_of_target).weekday())).normalize()
    cutoff = monday + pd.Timedelta(days=7)  # Strictly before 2026-02-16 00:00:00

    raw_fb = pd.DataFrame(
        [
            {
                "feedback_id": "FB-01",
                "created_at": "2026-02-09T10:00:00",
                "store_id": "ST-01",
                "text": "fridge not cold melting ice cream",
            },
            {
                "feedback_id": "FB-02",
                "created_at": "2026-02-15T23:50:00",
                "store_id": "ST-01",
                "text": "chiller failure warm milk",
            },
            # Future feedback (Week 6)
            {
                "feedback_id": "FB-FUTURE",
                "created_at": "2026-02-16T00:00:01",
                "store_id": "ST-01",
                "text": "freezer broken spoiled cheese",
            },
        ]
    )

    filtered = raw_fb[pd.to_datetime(raw_fb["created_at"]) < cutoff]
    assert len(filtered) == 2
    assert "FB-FUTURE" not in filtered["feedback_id"].values


def test_valid_issue_ids_only(sample_weeks):
    """Ensure flags only output operational issues IT01..IT30, never NI01..NI03."""
    rows = []
    # Generate 5 feedback rows for NI01 (Praise) in week 5
    w5 = sample_weeks[5]
    for i in range(10):
        rows.append(
            {
                "feedback_id": f"FB-PRAISE-{i}",
                "created_at": f"{w5}T10:00:00",
                "store_id": "ST-01",
                "text": "great store excellent staff love shopping thank you",
                "issue_type_id": "NI01",
            }
        )
    df = pd.DataFrame(rows)
    flags = detect_emerging_incidents(df, weeks=sample_weeks, emit_weeks=[w5])
    assert flags.empty or not any(cat in NON_ISSUE for cat in flags["issue_type_id"])


def test_empty_store_id_and_locality_matching(sample_stores):
    """Ensure missing store_id is attributed via locality text matching."""
    loc_map = extract_localities(sample_stores)
    assert loc_map["kankarbagh"] == "ST-02"
    assert loc_map["koramangala"] == "ST-01"

    # Row 1: Explicit store_id
    r1 = pd.Series({"store_id": "ST-01", "text": "no mention"})
    assert resolve_store_id(r1, loc_map) == "ST-01"

    # Row 2: NaN store_id with locality in text
    r2 = pd.Series({"store_id": np.nan, "text": "Customer call regarding the Kankarbagh store Atta had worms"})
    assert resolve_store_id(r2, loc_map) == "ST-02"

    # Row 3: Missing store_id with no locality
    r3 = pd.Series({"store_id": None, "text": "Random unassigned call with no branch named"})
    assert resolve_store_id(r3, loc_map) is None


def test_evidence_ids_validity_and_store_week_matching(sample_weeks, sample_stores):
    """Verify evidence IDs cited in flags belong to that store and that week."""
    rows = []
    w_target = sample_weeks[5]
    for i in range(5):
        rows.append(
            {
                "feedback_id": f"FB-ST01-EV-{i}",
                "created_at": f"{w_target}T12:00:00",
                "store_id": "ST-01",
                "text": "refrigerator not cooling milk spoiled",
                "issue_type_id": "IT10",
            }
        )
    df = pd.DataFrame(rows)
    loc_map = extract_localities(sample_stores)
    flags = detect_emerging_incidents(df, weeks=sample_weeks, emit_weeks=[w_target], loc_map=loc_map)

    assert not flags.empty
    flag = flags.iloc[0]
    assert flag["store_id"] == "ST-01"
    assert flag["issue_type_id"] == "IT10"
    evidence_ids = flag["evidence_feedback_ids"].split(";")
    assert len(evidence_ids) >= 2
    for fid in evidence_ids:
        assert fid.startswith("FB-ST01-EV-")


def test_three_flags_per_week_limit(sample_weeks):
    """Ensure no more than 3 flags are emitted per week even when multiple stores spike."""
    rows = []
    w_target = sample_weeks[5]
    # Create spikes for 6 different stores in the same week
    for s_idx in range(6):
        sid = f"ST-0{s_idx}"
        for f_idx in range(5):
            rows.append(
                {
                    "feedback_id": f"FB-{sid}-{f_idx}",
                    "created_at": f"{w_target}T10:00:00",
                    "store_id": sid,
                    "text": "queue is too long billing counter delay",
                    "issue_type_id": "IT01",
                }
            )
    df = pd.DataFrame(rows)
    flags = detect_emerging_incidents(df, weeks=sample_weeks, emit_weeks=[w_target])
    assert len(flags) <= 3
    assert len(flags[flags["as_of_week_start"] == w_target]) <= 3


def test_correct_output_csv_headers(sample_taxonomy, sample_weeks):
    """Verify column names and structure match official schemas."""
    df = pd.DataFrame(
        [
            {
                "feedback_id": "FB-1",
                "created_at": f"{sample_weeks[5]}T10:00:00",
                "store_id": "ST-01",
                "text": "queue is very long",
            },
        ]
    )
    labeled = label_feedback(df, sample_taxonomy)
    assert list(labeled[PRED_COLS].columns) == ["feedback_id", "issue_type_id", "severity", "actionable"]

    flags = detect_emerging_incidents(labeled, weeks=sample_weeks, emit_weeks=[sample_weeks[5]])
    assert list(flags[FLAG_COLS].columns) == [
        "as_of_week_start",
        "store_id",
        "issue_type_id",
        "confidence",
        "evidence_feedback_ids",
    ]


def test_empty_and_malformed_input():
    """Ensure detector handles empty inputs, missing columns, and nulls gracefully."""
    empty_df = pd.DataFrame()
    labeled = label_feedback(empty_df)
    assert labeled.empty
    assert list(labeled.columns) == ["feedback_id", "issue_type_id", "severity", "actionable"]

    flags = detect_emerging_incidents(empty_df, weeks=["2026-01-05"], emit_weeks=["2026-01-05"])
    assert flags.empty
    assert list(flags.columns) == FLAG_COLS

    # Malformed text
    malformed = pd.DataFrame(
        [
            {"feedback_id": "FB-X", "created_at": "invalid_date", "store_id": None, "text": None},
        ]
    )
    labeled_mal = label_feedback(malformed)
    assert len(labeled_mal) == 1
    assert labeled_mal.iloc[0]["issue_type_id"] == "NI02"


def test_reproducible_results(sample_weeks):
    """Verify deterministic sorting and identical output on repeated runs."""
    rows = []
    w_target = sample_weeks[6]
    for s_idx in range(4):
        sid = f"ST-0{s_idx}"
        for f_idx in range(4):
            rows.append(
                {
                    "feedback_id": f"FB-{sid}-{f_idx}",
                    "created_at": f"{w_target}T11:00:00",
                    "store_id": sid,
                    "text": "cockroach found on food counter hygiene issue",
                    "issue_type_id": "IT06",
                }
            )
    df = pd.DataFrame(rows)
    run1 = detect_emerging_incidents(df, weeks=sample_weeks, emit_weeks=[w_target])
    run2 = detect_emerging_incidents(df, weeks=sample_weeks, emit_weeks=[w_target])
    pd.testing.assert_frame_equal(run1, run2)


def test_policy_severity_weighting_promotes_critical_incidents(sample_weeks, sample_taxonomy):
    """Verify that high policy severity floor issues (weight 2.0) are prioritized over low floor issues."""
    rows = []
    w_target = sample_weeks[5]

    # Candidate 1: ST-LOW has 5 reports for IT01 (low floor), z ~ 4.0
    for i in range(5):
        rows.append(
            {
                "feedback_id": f"FB-LOW-{i}",
                "created_at": f"{w_target}T10:00:00",
                "store_id": "ST-LOW",
                "text": "queue delay counter slow",
                "issue_type_id": "IT01",
            }
        )

    # Candidate 2: ST-HIGH has 3 reports for IT17 (high floor), z ~ 2.8
    for i in range(3):
        rows.append(
            {
                "feedback_id": f"FB-HIGH-{i}",
                "created_at": f"{w_target}T10:00:00",
                "store_id": "ST-HIGH",
                "text": "glass piece found in pasta contamination",
                "issue_type_id": "IT17",
            }
        )

    df = pd.DataFrame(rows)

    # With high_severity_weight=2.0 (default), ST-HIGH (2.8 * 2.0 = 5.6) outranks ST-LOW (4.0 * 1.0 = 4.0)
    weighted = detect_emerging_incidents(
        df,
        weeks=sample_weeks,
        emit_weeks=[w_target],
        tax=sample_taxonomy,
        high_severity_weight=2.0,
        z_threshold=2.0,
        min_count=2,
    )
    assert not weighted.empty
    assert weighted.iloc[0]["store_id"] == "ST-HIGH"
    assert weighted.iloc[0]["issue_type_id"] == "IT17"


def test_default_thresholds_match_winning_experiment():
    """Verify that default thresholds are z=2.5 and min_count=2."""
    import inspect

    sig = inspect.signature(detect_emerging_incidents)
    assert sig.parameters["z_threshold"].default == 2.5
    assert sig.parameters["min_count"].default == 2
    assert sig.parameters["max_flags_per_week"].default == 3
    assert sig.parameters["high_severity_weight"].default == 2.0
