"""Tests for the trained classifier: policy floor, non-issue handling and explanation output."""

import pandas as pd
import pytest

from ml_classifier import FeedbackModel

TAX = pd.DataFrame({"policy_severity_floor": {"IT10": "high", "IT14": "low", "NI01": "low"}})
EXAMPLES = [
    ("frzr not cooling milk melted", "IT10"),
    ("freezer broken ice cream melted", "IT10"),
    ("chiller warm dairy spoiled", "IT10"),
    ("shelf empty no atta", "IT14"),
    ("oos rice again", "IT14"),
    ("out of stock sugar", "IT14"),
    ("great store thank you", "NI01"),
    ("lovely staff and clean", "NI01"),
    ("excellent service happy", "NI01"),
]
TRAIN = pd.DataFrame(EXAMPLES * 3, columns=["text", "issue_type_id"])
TRAIN["severity"] = TRAIN["issue_type_id"].map(
    {"IT10": "low", "IT14": "medium", "NI01": "low"}
)  # IT10 "low" so only the floor can lift it
TRAIN["actionable"] = (TRAIN["issue_type_id"] != "NI01").astype(int)


@pytest.fixture(scope="module")
def model():
    return FeedbackModel(TAX).fit(TRAIN["text"], TRAIN)


def test_predicts_issue_type(model):
    out = model.predict(pd.Series(["freezer not cooling ice cream melted"]))
    assert out.iloc[0]["issue_type_id"] == "IT10"


def test_policy_floor_lifts_severity_even_if_model_says_low(model):
    out = model.predict(pd.Series(["freezer not cooling ice cream melted"]))
    assert out.iloc[0]["severity"] == "high"


def test_non_issue_is_never_actionable(model):
    out = model.predict(pd.Series(["great store thank you so much"]))
    assert out.iloc[0]["issue_type_id"] == "NI01"
    assert out.iloc[0]["actionable"] == 0


def test_explain_returns_confidence_in_range_and_terms(model):
    detail = model.explain("freezer not cooling ice cream melted")
    assert 0.5 <= detail["confidence"] <= 1.0
    assert detail["matched_terms"]
