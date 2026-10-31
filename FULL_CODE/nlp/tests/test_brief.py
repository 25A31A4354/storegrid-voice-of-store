"""Tests for the regional brief helpers: quote extraction, trend arrows, ranking."""

import pandas as pd

from brief import customer_quote, region_issues, trend_arrow

TAXONOMY = pd.DataFrame(
    {
        "issue_type": {"IT08": "Safety hazard", "IT14": "Out of stock"},
        "owner_function": {"IT08": "Store Ops", "IT14": "Supply Chain"},
    }
)


def test_customer_quote_takes_first_customer_line_of_a_transcript():
    text = "Agent: hello how may I help Customer: the freezer is leaking [inaudible] Agent: sorry to hear that"
    assert customer_quote(text) == "the freezer is leaking"


def test_customer_quote_truncates_long_text():
    assert len(customer_quote("x" * 400)) <= 150


def test_trend_arrow_up_down_and_flat():
    assert trend_arrow(10, 2) == "↑"
    assert trend_arrow(2, 10) == "↓"
    assert trend_arrow(10, 10) == "→"


def test_high_severity_outranks_higher_volume():
    week = pd.Timestamp("2026-09-21")
    rows = [("IT08", "high", "s1")] * 2 + [("IT14", "low", "s1")] * 4
    df = pd.DataFrame(rows, columns=["issue_type_id", "severity", "store_name"])
    df["region"], df["week_start"], df["text"] = "South", week, "short text"
    df["feedback_id"] = [f"FB-{i}" for i in range(len(df))]
    issues = region_issues(df, "South", week, TAXONOMY)
    assert [i["issue"] for i in issues] == ["IT08", "IT14"]  # 2*4=8 beats 4*1=4
