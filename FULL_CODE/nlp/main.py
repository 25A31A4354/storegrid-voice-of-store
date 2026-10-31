import logging
import os
from pathlib import Path

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from classifier import TAXONOMY_METADATA, classify_text
from schemas import ClassificationResponse, FeedbackInput

try:
    from ml_classifier import FeedbackModel
except ImportError:
    FeedbackModel = None

log = logging.getLogger("storegrid.nlp")
DATA_DIR = Path(os.environ.get("STOREGRID_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
REVIEW_BELOW = float(os.environ.get("STOREGRID_REVIEW_BELOW", "0.7"))  # held-out: ~57% accurate below, ~97% above


def load_model():
    """Trains on the public labelled sample at startup (a few seconds); None means use the rule engine."""
    paths = [DATA_DIR / n for n in ("feedback.csv", "feedback_labels_train.csv", "issue_taxonomy.csv")]
    if FeedbackModel is None or not all(p.exists() for p in paths):
        log.warning("ML model unavailable (scikit-learn or data missing in %s); using rule engine", DATA_DIR)
        return None
    fb, labels, tax = (pd.read_csv(p) for p in paths)
    train = labels.merge(fb[["feedback_id", "text"]], on="feedback_id")
    return FeedbackModel(tax.set_index("issue_type_id")).fit(train["text"], train)


MODEL = load_model()

app = FastAPI(
    title="StoreGrid NLP Service",
    description="Operational retail feedback classification API — Official R5 Taxonomy",
    version="2.0.0",
)
app.add_middleware(  # the dashboard checks /health straight from the browser
    CORSMiddleware,
    allow_origins=[os.environ.get("CORS_ORIGIN", "http://localhost:5173")],
    allow_methods=["GET", "POST"],
)


@app.get("/")
def home():
    return {
        "message": "StoreGrid NLP Service is running with official R5 taxonomy!",
        "status": "success",
        "taxonomy": "R5_33_CATEGORIES",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "storegrid-nlp",
        "version": "2.0.0",
        "taxonomy": "R5_33_CATEGORIES",
        "classifier": "tfidf-linear-svm" if MODEL is not None else "rule-engine",
    }


def classify_with_model(feedback: FeedbackInput) -> ClassificationResponse:
    texts = pd.Series([feedback.text])
    label = MODEL.predict(texts).iloc[0]
    detail = MODEL.explain(feedback.text)
    meta = TAXONOMY_METADATA[detail["issue_type_id"]]
    return ClassificationResponse(
        feedbackId=feedback.feedbackId,
        storeId=feedback.storeId,
        originalText=feedback.text,
        cleanedText=" ".join(feedback.text.lower().split()),
        category=detail["issue_type_id"],
        confidence=detail["confidence"],
        needsReview=detail["confidence"] < REVIEW_BELOW,
        matchedTerms=detail["matched_terms"],
        severity=str(label["severity"]),
        actionable=int(label["actionable"]),
        ownerFunction=meta["owner"],
        categoryName=meta["name"],
    )


@app.post("/classify", response_model=ClassificationResponse)
def classify_feedback(feedback: FeedbackInput):
    if MODEL is not None and feedback.text.strip():  # blank text keeps the rule engine's zero-confidence review path
        return classify_with_model(feedback)
    classification = classify_text(feedback.text)

    return ClassificationResponse(
        feedbackId=feedback.feedbackId,
        storeId=feedback.storeId,
        originalText=classification.original_text,
        cleanedText=classification.cleaned_text,
        category=classification.category,
        confidence=classification.confidence,
        needsReview=classification.needs_review,
        matchedTerms=classification.matched_terms,
        severity=classification.severity,
        actionable=classification.actionable,
        ownerFunction=classification.owner_function,
        categoryName=classification.category_name,
    )
