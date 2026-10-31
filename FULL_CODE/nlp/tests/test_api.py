"""
API integration tests for StoreGrid FastAPI endpoints (Official R5 Taxonomy).
Tests GET /, GET /health, POST /classify, validation errors,
and payload responses.
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_home_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "StoreGrid NLP Service" in data["message"]


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "storegrid-nlp"
    assert data["version"] == "2.0.0"


def test_refrigeration_failure_it10_endpoint():
    """
    Verifies Problem R5 refrigeration failure classification on FastAPI endpoint.
    """
    payload = {
        "feedbackId": "fb-refrig-01",
        "storeId": "STR-HYD-001",
        "text": "The refrigerator is not cooling properly, and several customers have complained about spoiled milk.",
        "sourceType": "CUSTOMER_REVIEW",
        "language": "en",
    }
    response = client.post("/classify", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["category"] == "IT10"
    assert data["categoryName"] == "Refrigeration / cold-chain failure"
    assert data["ownerFunction"] == "Store Ops"
    assert data["severity"] == "high"
    assert data["actionable"] == 1
    assert data["confidence"] >= 0.60
    assert any("cooling" in t for t in data["matchedTerms"])


def test_express_backend_integration_contract():
    """
    Simulates a request from Vinay's Express backend.
    Verifies that all required JSON fields are present with correct types and classification.
    """
    payload = {
        "feedbackId": "vinay-node-req-001",
        "storeId": "STORE-HYD-01",
        "text": "The cashier was very rude and unhelpful",
        "sourceType": "express_backend",
        "language": "en",
        "createdAt": "2026-10-16T15:00:00.000Z",
    }
    response = client.post("/classify", json=payload)
    assert response.status_code == 200
    data = response.json()

    expected_fields = [
        "feedbackId",
        "storeId",
        "originalText",
        "cleanedText",
        "category",
        "confidence",
        "needsReview",
        "matchedTerms",
        "severity",
        "actionable",
        "ownerFunction",
        "categoryName",
    ]
    for field in expected_fields:
        assert field in data, f"Missing agreed response field: {field}"

    assert data["feedbackId"] == "vinay-node-req-001"
    assert data["storeId"] == "STORE-HYD-01"
    assert data["category"] in ("IT03", "IT04")
    assert isinstance(data["confidence"], float)
    assert data["confidence"] >= 0.55  # close IT03/IT04 call: expected to land near the review threshold
    assert isinstance(data["matchedTerms"], list)
    assert len(data["matchedTerms"]) > 0


def test_classify_valid_billing_queue():
    payload = {
        "feedbackId": "fb-101",
        "storeId": "str-vizag-01",
        "text": "   Billing   Chala   SLOW   ga   undi!   ",
        "sourceType": "mobile_app",
        "language": "te-en",
        "createdAt": "2026-10-16T10:00:00Z",
    }
    response = client.post("/classify", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["category"] == "IT01"
    assert data["categoryName"] == "Long checkout queue / slow billing"
    assert data["confidence"] >= 0.60
    assert any("billing" in t for t in data["matchedTerms"])


def test_classify_stock_shortage():
    payload = {
        "feedbackId": "fb-102",
        "storeId": "str-hyd-04",
        "text": "Sunflower oil was completely out of stock today.",
    }
    response = client.post("/classify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["category"] == "IT14"
    assert data["actionable"] == 1


def test_classify_non_issue_praise():
    payload = {
        "feedbackId": "fb-ni-01",
        "storeId": "str-hyd-02",
        "text": "Great store, staff very helpful and fresh veggies today!",
    }
    response = client.post("/classify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["category"] == "NI01"
    assert data["actionable"] == 0
    assert data["severity"] == "low"


def test_classify_empty_text():
    payload = {
        "feedbackId": "fb-104",
        "storeId": "str-vja-01",
        "text": "    ",
    }
    response = client.post("/classify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["category"] == "NI02"
    assert data["confidence"] == 0.0
    assert data["needsReview"] is True
    assert data["actionable"] == 0


def test_classify_invalid_request_missing_text():
    payload = {
        "feedbackId": "fb-105",
        "storeId": "str-vja-01",
    }
    response = client.post("/classify", json=payload)
    assert response.status_code == 422


def test_classify_invalid_request_missing_store_id():
    payload = {
        "feedbackId": "fb-106",
        "text": "Good store",
    }
    response = client.post("/classify", json=payload)
    assert response.status_code == 422


def test_classify_invalid_request_missing_feedback_id():
    payload = {
        "storeId": "str-01",
        "text": "Good store",
    }
    response = client.post("/classify", json=payload)
    assert response.status_code == 422
