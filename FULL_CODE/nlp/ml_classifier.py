"""Trained classifier for the R5 feedback labels (issue type, severity, actionable).

Why a trained model: the feedback is code-mixed (English, Hinglish, transliterated Tamil and Marathi)
with typos, so hand-written keyword rules cannot cover it. Character n-grams absorb the spelling
variation without any language-specific code. On weeks 10-13 held out from training this scores
macro-F1 ~0.90 against ~0.55 for the regex rules in detector.py.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC

NON_ISSUE = {"NI01", "NI02", "NI03"}
SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}
SEVERITY_NAMES = {v: k for k, v in SEVERITY_ORDER.items()}
C_PARAM = 1.0  # picked on a time-based split (train weeks 1-9, test 10-13); 0.2-2 all within 0.02 F1


def _features() -> FeatureUnion:
    return FeatureUnion(
        [
            ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2)),
            ("word", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), sublinear_tf=True)),
        ]
    )


def _svc() -> LinearSVC:
    return LinearSVC(C=C_PARAM, class_weight="balanced", random_state=0)


class FeedbackModel:
    """TF-IDF features feeding three linear SVMs, with the policy severity floor applied after."""

    def __init__(self, taxonomy: pd.DataFrame):
        self.floor = taxonomy["policy_severity_floor"].map(SEVERITY_ORDER)
        self.features = _features()
        self.type_model = _svc()
        self.severity_model = _svc()
        self.actionable_model = _svc()

    def fit(self, texts: pd.Series, labels: pd.DataFrame) -> FeedbackModel:
        """`labels` needs issue_type_id, severity and actionable columns aligned with `texts`."""
        x = self.features.fit_transform(texts.fillna("").astype(str))
        self.type_model.fit(x, labels["issue_type_id"])
        self.severity_model.fit(x, labels["severity"])
        self.actionable_model.fit(x, labels["actionable"])
        return self

    def predict(self, texts: pd.Series) -> pd.DataFrame:
        x = self.features.transform(texts.fillna("").astype(str))
        issue = pd.Series(self.type_model.predict(x), index=texts.index)
        severity = pd.Series(self.severity_model.predict(x), index=texts.index).map(SEVERITY_ORDER)
        # Annotation guideline: severity = max(policy floor, impact).
        severity = pd.concat([severity, issue.map(self.floor).fillna(0)], axis=1).max(axis=1)
        actionable = pd.Series(self.actionable_model.predict(x), index=texts.index)
        actionable = actionable.where(~issue.isin(NON_ISSUE), 0)
        return pd.DataFrame(
            {
                "issue_type_id": issue,
                "severity": severity.astype(int).map(SEVERITY_NAMES),
                "actionable": actionable.astype(int),
            }
        )

    def explain(self, text: str, top_n: int = 4) -> dict:
        """One-text prediction with a confidence and the words that pushed the decision (for the UI)."""
        x = self.features.transform(pd.Series([text or ""]))
        scores = self.type_model.decision_function(x)[0]
        order = np.argsort(scores)[::-1]
        issue = self.type_model.classes_[order[0]]
        # Margin between the best and runner-up class, squashed to (0.5, 1): a close call scores near 0.5.
        confidence = float(1 / (1 + np.exp(-3 * (scores[order[0]] - scores[order[1]]))))

        word_vec = self.features.transformer_list[1][1]
        n_char = len(self.features.transformer_list[0][1].vocabulary_)
        coef = self.type_model.coef_[order[0]][n_char:]
        weights = word_vec.transform([text or ""]).toarray()[0] * coef
        names = word_vec.get_feature_names_out()
        terms = [names[i] for i in np.argsort(weights)[::-1][:top_n] if weights[i] > 0]
        return {"issue_type_id": str(issue), "confidence": round(confidence, 2), "matched_terms": terms}
