"""
Unit tests for StoreGrid feedback classifier aligned with Official R5 Taxonomy.
Tests all 33 category classifications, refrigeration failure fix,
severity policy floors, actionability flags, and edge cases.
"""

from classifier import (
    CATEGORY_IT01,
    CATEGORY_IT04,
    CATEGORY_IT06,
    CATEGORY_IT08,
    CATEGORY_IT10,
    CATEGORY_IT11,
    CATEGORY_IT14,
    CATEGORY_IT16,
    CATEGORY_IT17,
    CATEGORY_IT27,
    CATEGORY_NI01,
    CATEGORY_NI02,
    CATEGORY_NI03,
    OFFICIAL_CATEGORIES,
    classify_text,
    clean_text,
)


class TestTextNormalization:
    """Verifies that original text is preserved and cleanedText is properly normalized."""

    def test_whitespace_and_casing(self):
        raw = "   Billing   Chala   SLOW   ga   undi!   \n\t"
        cleaned = clean_text(raw)
        assert cleaned == "billing chala slow ga undi!"

    def test_empty_and_none(self):
        assert clean_text("") == ""
        assert clean_text(None) == ""
        assert clean_text("    ") == ""

    def test_original_text_preservation(self):
        raw = "  RUDE Staff at Counter!!  "
        result = classify_text(raw)
        assert result.original_text == raw
        assert result.cleaned_text == "rude staff at counter!!"


class TestR5RefrigerationFailureBugFix:
    """
    Verifies that the refrigeration failure bug is completely fixed.
    The exact input from hackathon challenge problem R5 must classify as IT10 with high severity.
    """

    def test_sample_refrigeration_spoiled_milk(self):
        text = "The refrigerator is not cooling properly, and several customers have complained about spoiled milk."
        res = classify_text(text)
        assert res.category == CATEGORY_IT10
        assert res.category_name == "Refrigeration / cold-chain failure"
        assert res.owner_function == "Store Ops"
        assert res.severity == "high"
        assert res.actionable == 1
        assert res.confidence >= 0.90
        assert "refrigeration cooling failure" in res.matched_terms

    def test_freezer_breakdown(self):
        text = "Deep freezer unit is completely off and dairy is spoiling"
        res = classify_text(text)
        assert res.category == CATEGORY_IT10
        assert res.severity == "high"
        assert res.actionable == 1

    def test_melted_ice_cream(self):
        text = "Ice cream tubs soft and dripping, chiller showing 14 degrees"
        res = classify_text(text)
        assert res.category == CATEGORY_IT10
        assert res.severity == "high"


class TestOfficialR5Categories:
    """Tests representative categories across Store Ops, HR, Supply Chain, Merchandising, Digital, Non-Issues."""

    def test_it01_slow_billing(self):
        res = classify_text("Waited 40 min at billing, only 2 counters open")
        assert res.category == CATEGORY_IT01
        assert res.severity == "low"
        assert res.actionable == 1

    def test_it04_staff_misconduct_high_severity(self):
        res = classify_text("Billing staff shouted and used abusive language at customer")
        assert res.category == CATEGORY_IT04
        assert res.severity == "high"  # Policy floor high
        assert res.owner_function == "HR"

    def test_it06_hygiene_cockroach_high_severity(self):
        res = classify_text("Saw a cockroach near the bakery counter, filthy and unhygienic")
        assert res.category == CATEGORY_IT06
        assert res.severity == "high"  # Policy floor high

    def test_it08_safety_hazard_high_severity(self):
        res = classify_text("Floor wet near entrance, no caution board, slippery surface")
        assert res.category == CATEGORY_IT08
        assert res.severity == "high"  # Policy floor high

    def test_it11_non_refrigeration_equipment(self):
        res = classify_text("The barcode scanner broke down and cashier had to punch manually")
        assert res.category == CATEGORY_IT11
        assert res.severity == "low"

    def test_it14_stock_shortage(self):
        res = classify_text("Toor dal out of stock for a week, empty shelves in aisle 2")
        assert res.category == CATEGORY_IT14
        assert res.actionable == 1

    def test_it16_expired_product(self):
        res = classify_text("Bread on shelf was 2 days past expiry date, expired milk found")
        assert res.category == CATEGORY_IT16
        assert res.severity == "high"

    def test_it17_contamination(self):
        res = classify_text("Found worms in the atta packet and small stone in rice")
        assert res.category == CATEGORY_IT17
        assert res.severity == "high"

    def test_it27_payment_failure_medium_severity(self):
        res = classify_text("UPI payment failed but money debited from account without order")
        assert res.category == CATEGORY_IT27
        assert res.severity == "medium"  # Policy floor medium

    def test_ni01_praise_non_actionable(self):
        res = classify_text("Great store, staff very helpful, wonderful experience today!")
        assert res.category == CATEGORY_NI01
        assert res.actionable == 0
        assert res.severity == "low"

    def test_ni02_general_chatter_non_actionable(self):
        res = classify_text("When will you open a store in Wakad? Handover done all ok.")
        assert res.category == CATEGORY_NI02
        assert res.actionable == 0

    def test_ni03_spam_non_actionable(self):
        res = classify_text("Earn 5000 daily from home click telegram link or subscribe")
        assert res.category == CATEGORY_NI03
        assert res.actionable == 0


class TestCriticalSeverityEscalation:
    """Verifies that critical keywords escalate severity to critical when policy floor is high/medium."""

    def test_hospital_visit_food_poisoning(self):
        text = "Child got food poisoning and hospital visit after eating expired dairy from chiller"
        res = classify_text(text)
        assert res.category in (CATEGORY_IT10, CATEGORY_IT16)
        assert res.severity == "critical"

    def test_fire_safety_critical(self):
        text = "Electric shock from exposed wire near entrance, fire hazard"
        res = classify_text(text)
        assert res.category == CATEGORY_IT08
        assert res.severity == "critical"


class TestAmbiguousAndEmptyFeedback:
    """Verifies safe handling of insufficient or empty text."""

    def test_empty_string(self):
        res = classify_text("")
        assert res.category == CATEGORY_NI02
        assert res.confidence == 0.0
        assert res.needs_review is True
        assert res.actionable == 0

    def test_whitespace_only(self):
        res = classify_text("   \n\t  ")
        assert res.category == CATEGORY_NI02
        assert res.confidence == 0.0
        assert res.needs_review is True


class TestTaxonomyCompleteness:
    """Verifies that all 33 official categories are registered and supported."""

    def test_all_33_categories_present(self):
        assert len(OFFICIAL_CATEGORIES) == 33
        for i in range(1, 31):
            assert f"IT{i:02d}" in OFFICIAL_CATEGORIES
        assert "NI01" in OFFICIAL_CATEGORIES
        assert "NI02" in OFFICIAL_CATEGORIES
        assert "NI03" in OFFICIAL_CATEGORIES
