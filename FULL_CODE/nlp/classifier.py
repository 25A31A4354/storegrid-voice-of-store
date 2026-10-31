"""
StoreGrid NLP Feedback Classification Engine — Official Talent AP Mega Hackathon R5 Edition.

Supports all 33 official R5 Issue Types:
- IT01 to IT30: Operational Issue Categories
- NI01 to NI03: Non-Actionable Categories (Praise, General Chatter, Spam)

Includes:
- English, Hinglish, Telugu-English code-mixed phrase matching
- Exact IT10 Refrigeration / Cold-Chain Failure detection
- Policy severity floor enforcement & critical keyword escalation
- Transparent heuristic scoring (not fabricated Bayesian probabilities)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Final

# ---------------------------------------------------------------------------
# Official R5 Category Identifiers (33 Categories)
# ---------------------------------------------------------------------------

# Operational Issues (IT01 - IT30)
CATEGORY_IT01: Final[str] = "IT01"  # Long checkout queue / slow billing
CATEGORY_IT02: Final[str] = "IT02"  # Understaffing / staff shortage on floor
CATEGORY_IT03: Final[str] = "IT03"  # Unhelpful or poorly trained staff
CATEGORY_IT04: Final[str] = "IT04"  # Staff misconduct (abusive, harassment, cheating)
CATEGORY_IT05: Final[str] = "IT05"  # Staff welfare grievance
CATEGORY_IT06: Final[str] = "IT06"  # Hygiene lapse (pests, dirty food areas, foul smell)
CATEGORY_IT07: Final[str] = "IT07"  # Store untidy / poor upkeep
CATEGORY_IT08: Final[str] = "IT08"  # Physical safety hazard (wet floor, wiring, falling stock)
CATEGORY_IT09: Final[str] = "IT09"  # Roof leak / water seepage
CATEGORY_IT10: Final[str] = "IT10"  # Refrigeration / cold-chain failure
CATEGORY_IT11: Final[str] = "IT11"  # Equipment breakdown (AC, lift, lights, scale, POS)
CATEGORY_IT12: Final[str] = "IT12"  # Carry-bag charge / checkout packing
CATEGORY_IT13: Final[str] = "IT13"  # Parking, access or store timings
CATEGORY_IT14: Final[str] = "IT14"  # Out of stock / empty shelves
CATEGORY_IT15: Final[str] = "IT15"  # Poor quality fresh produce
CATEGORY_IT16: Final[str] = "IT16"  # Expired / near-expiry product on shelf
CATEGORY_IT17: Final[str] = "IT17"  # Foreign object / contamination in product
CATEGORY_IT18: Final[str] = "IT18"  # Allergen / ingredient labelling error
CATEGORY_IT19: Final[str] = "IT19"  # Shelf price vs bill price mismatch
CATEGORY_IT20: Final[str] = "IT20"  # Promotion / offer not applied
CATEGORY_IT21: Final[str] = "IT21"  # Private-label product quality
CATEGORY_IT22: Final[str] = "IT22"  # Assortment request / product not carried
CATEGORY_IT23: Final[str] = "IT23"  # Online order delivery delay / missed slot
CATEGORY_IT24: Final[str] = "IT24"  # Wrong or missing items in online order
CATEGORY_IT25: Final[str] = "IT25"  # Damaged or leaking items on delivery
CATEGORY_IT26: Final[str] = "IT26"  # App / website crash, login or bug
CATEGORY_IT27: Final[str] = "IT27"  # Payment failure / money debited but order failed
CATEGORY_IT28: Final[str] = "IT28"  # Refund / return not processed
CATEGORY_IT29: Final[str] = "IT29"  # Loyalty points / coupon problem
CATEGORY_IT30: Final[str] = "IT30"  # Billing error at counter (double scan, wrong weight/qty)

# Non-Issues (NI01 - NI03)
CATEGORY_NI01: Final[str] = "NI01"  # Praise / compliment
CATEGORY_NI02: Final[str] = "NI02"  # General comment / suggestion / question
CATEGORY_NI03: Final[str] = "NI03"  # Spam / irrelevant

# Legacy Aliases (Backwards Compatibility)
CATEGORY_STOCK_SHORTAGE: Final[str] = "IT14"
CATEGORY_BILLING_DELAY: Final[str] = "IT01"
CATEGORY_STAFF_BEHAVIOUR: Final[str] = "IT03"
CATEGORY_PRODUCT_QUALITY: Final[str] = "IT15"
CATEGORY_EQUIPMENT_FAILURE: Final[str] = "IT11"
CATEGORY_REFRIGERATION: Final[str] = "IT10"
CATEGORY_OTHER: Final[str] = "NI02"
CATEGORY_NEEDS_REVIEW: Final[str] = "NEEDS_REVIEW"

OFFICIAL_CATEGORIES: Final[list[str]] = [f"IT{i:02d}" for i in range(1, 31)] + ["NI01", "NI02", "NI03"]

SUPPORTED_CATEGORIES: Final[list[str]] = OFFICIAL_CATEGORIES + [
    "STOCK_SHORTAGE",
    "BILLING_DELAY",
    "STAFF_BEHAVIOUR",
    "PRODUCT_QUALITY",
    "EQUIPMENT_FAILURE",
    "OTHER",
    "NEEDS_REVIEW",
]

NON_ACTIONABLE_CATEGORIES: Final[set[str]] = {"NI01", "NI02", "NI03"}

# ---------------------------------------------------------------------------
# Official Taxonomy Metadata (from data/issue_taxonomy.csv)
# ---------------------------------------------------------------------------
TAXONOMY_METADATA: Final[dict[str, dict[str, Any]]] = {
    "IT01": {
        "name": "Long checkout queue / slow billing",
        "owner": "Store Ops",
        "policy_floor": "low",
        "actionable": 1,
    },
    "IT02": {"name": "Understaffing / staff shortage on floor", "owner": "HR", "policy_floor": "low", "actionable": 1},
    "IT03": {"name": "Unhelpful or poorly trained staff", "owner": "HR", "policy_floor": "low", "actionable": 1},
    "IT04": {
        "name": "Staff misconduct (abusive, harassment, cheating customers)",
        "owner": "HR",
        "policy_floor": "high",
        "actionable": 1,
    },
    "IT05": {"name": "Staff welfare grievance", "owner": "HR", "policy_floor": "low", "actionable": 1},
    "IT06": {
        "name": "Hygiene lapse (pests, dirty food areas, foul smell)",
        "owner": "Store Ops",
        "policy_floor": "high",
        "actionable": 1,
    },
    "IT07": {"name": "Store untidy / poor upkeep", "owner": "Store Ops", "policy_floor": "low", "actionable": 1},
    "IT08": {
        "name": "Physical safety hazard (wet floor, wiring, falling stock)",
        "owner": "Store Ops",
        "policy_floor": "high",
        "actionable": 1,
    },
    "IT09": {"name": "Roof leak / water seepage", "owner": "Store Ops", "policy_floor": "low", "actionable": 1},
    "IT10": {
        "name": "Refrigeration / cold-chain failure",
        "owner": "Store Ops",
        "policy_floor": "high",
        "actionable": 1,
    },
    "IT11": {
        "name": "Equipment breakdown (AC, lift, lights, scale, POS)",
        "owner": "Store Ops",
        "policy_floor": "low",
        "actionable": 1,
    },
    "IT12": {
        "name": "Carry-bag charge / checkout packing",
        "owner": "Store Ops",
        "policy_floor": "low",
        "actionable": 1,
    },
    "IT13": {"name": "Parking, access or store timings", "owner": "Store Ops", "policy_floor": "low", "actionable": 1},
    "IT14": {"name": "Out of stock / empty shelves", "owner": "Supply Chain", "policy_floor": "low", "actionable": 1},
    "IT15": {"name": "Poor quality fresh produce", "owner": "Supply Chain", "policy_floor": "low", "actionable": 1},
    "IT16": {
        "name": "Expired / near-expiry product on shelf",
        "owner": "Store Ops",
        "policy_floor": "high",
        "actionable": 1,
    },
    "IT17": {
        "name": "Foreign object / contamination in product",
        "owner": "Merchandising",
        "policy_floor": "high",
        "actionable": 1,
    },
    "IT18": {
        "name": "Allergen / ingredient labelling error",
        "owner": "Merchandising",
        "policy_floor": "high",
        "actionable": 1,
    },
    "IT19": {
        "name": "Shelf price vs bill price mismatch",
        "owner": "Merchandising",
        "policy_floor": "low",
        "actionable": 1,
    },
    "IT20": {"name": "Promotion / offer not applied", "owner": "Merchandising", "policy_floor": "low", "actionable": 1},
    "IT21": {"name": "Private-label product quality", "owner": "Merchandising", "policy_floor": "low", "actionable": 1},
    "IT22": {
        "name": "Assortment request / product not carried",
        "owner": "Merchandising",
        "policy_floor": "low",
        "actionable": 1,
    },
    "IT23": {
        "name": "Online order delivery delay / missed slot",
        "owner": "Supply Chain",
        "policy_floor": "low",
        "actionable": 1,
    },
    "IT24": {
        "name": "Wrong or missing items in online order",
        "owner": "Supply Chain",
        "policy_floor": "low",
        "actionable": 1,
    },
    "IT25": {
        "name": "Damaged or leaking items on delivery",
        "owner": "Supply Chain",
        "policy_floor": "low",
        "actionable": 1,
    },
    "IT26": {"name": "App / website crash, login or bug", "owner": "Digital", "policy_floor": "low", "actionable": 1},
    "IT27": {
        "name": "Payment failure / money debited but order failed",
        "owner": "Digital",
        "policy_floor": "medium",
        "actionable": 1,
    },
    "IT28": {"name": "Refund / return not processed", "owner": "Digital", "policy_floor": "low", "actionable": 1},
    "IT29": {"name": "Loyalty points / coupon problem", "owner": "Digital", "policy_floor": "low", "actionable": 1},
    "IT30": {
        "name": "Billing error at counter (double scan, wrong weight/qty)",
        "owner": "Store Ops",
        "policy_floor": "low",
        "actionable": 1,
    },
    "NI01": {"name": "Praise / compliment", "owner": "None (not actionable)", "policy_floor": "low", "actionable": 0},
    "NI02": {
        "name": "General comment / suggestion / question",
        "owner": "None (not actionable)",
        "policy_floor": "low",
        "actionable": 0,
    },
    "NI03": {"name": "Spam / irrelevant", "owner": "None (not actionable)", "policy_floor": "low", "actionable": 0},
}

# Critical escalation indicators
CRITICAL_WORDS = re.compile(
    r"\b(hospital|sick|poisoning|injur(y|ed)?|stitch|doctor|reaction|rashes|beemar|vaanthi|aajari|harass(ment)?|fire|electric shock|shock|casualt(y|ies))\b",
    re.IGNORECASE,
)

MIN_CONFIDENCE_THRESHOLD: Final[float] = 0.60
CONFLICT_CONFIDENCE_SCORE: Final[float] = 0.40


@dataclass(frozen=True)
class Rule:
    pattern: re.Pattern[str]
    display_term: str
    weight: float


@dataclass
class ClassificationResult:
    original_text: str
    cleaned_text: str
    category: str
    confidence: float
    needs_review: bool
    matched_terms: list[str] = field(default_factory=list)
    severity: str = "low"
    actionable: int = 1
    owner_function: str = "Store Ops"
    category_name: str = ""


def clean_text(raw_text: str | None) -> str:
    """Normalizes whitespace and lowercase for reliable rule matching."""
    if not raw_text:
        return ""
    return " ".join(raw_text.lower().split())


def _compile_rule(regex_str: str, display_term: str, weight: float) -> Rule:
    return Rule(
        pattern=re.compile(regex_str, re.IGNORECASE),
        display_term=display_term,
        weight=weight,
    )


# ---------------------------------------------------------------------------
# Rule Definitions: Exact pattern mapping for all 33 categories
# ---------------------------------------------------------------------------

RULES: dict[str, list[Rule]] = {
    # IT01: Long checkout queue / slow billing
    CATEGORY_IT01: [
        _compile_rule(
            r"\b(long|huge|terrible|slow) (queue|line|wait) (at|in|for) (billing|counter|pos|checkout)\b",
            "long checkout queue",
            0.90,
        ),
        _compile_rule(
            r"\b(billing|checkout) (counter )?(is |was )?(chala )?(slow|delayed|taking too long)\b",
            "slow billing",
            0.90,
        ),
        _compile_rule(r"\bwaited (for )?\d+ (mins|minutes) (in|at) (line|queue|billing)\b", "queue wait time", 0.88),
        _compile_rule(r"\bonly (one|1|two|2) counters? (open|working|active)\b", "counters closed", 0.88),
        _compile_rule(r"\b(billing|counter) (chala slow|delay undi|slow ga)\b", "billing chala slow", 0.90),
        _compile_rule(r"\b(line peddaga undi|line lo nunchoni)\b", "line peddaga undi", 0.90),
        _compile_rule(r"\b(queue|billing counter|checkout queue|wait at billing)\b", "billing queue", 0.78),
    ],
    # IT02: Understaffing / staff shortage on floor
    CATEGORY_IT02: [
        _compile_rule(
            r"\b(no staff|understaffed|short of staff|staff shortage|nobody on floor)\b", "staff shortage", 0.90
        ),
        _compile_rule(
            r"\bno one (in|at) (fruits|veggies|vegetables|dairy|aisle|counter) (to weigh|to help)\b",
            "no staff to help",
            0.88,
        ),
        _compile_rule(r"\b(staff absent|shift gap|need more staff)\b", "staff absent", 0.85),
        _compile_rule(r"\b(staff leru|evvaru leru|koi nahi|yaarum illa)\b", "staff leru", 0.90),
    ],
    # IT03: Unhelpful or poorly trained staff
    CATEGORY_IT03: [
        _compile_rule(
            r"\b(staff|cashier|manager|employee) (was |is )?(extremely |very )?(rude|arrogant|unhelpful|disrespectful)\b",
            "rude staff",
            0.90,
        ),
        _compile_rule(
            r"\b(unhelpful|indifferent|ignored|attitude|rude staff|staff ignored|staff shrugged)\b",
            "unhelpful staff",
            0.88,
        ),
        _compile_rule(r"\b(did not help|did not know|unresponsive staff|poor service)\b", "did not help", 0.85),
        _compile_rule(
            r"\b(staff mariadaga matladaledu|pattinchukoledu|arrogant staff)\b", "staff mariadaga matladaledu", 0.90
        ),
        _compile_rule(r"\b(staff was rude|cashier was rude|manager was rude)\b", "rude staff", 0.88),
    ],
    # IT04: Staff misconduct (abusive, harassment, cheating customers)
    CATEGORY_IT04: [
        _compile_rule(
            r"\b(abusive|screamed|harass(ment)?|shouted at|assault|thief|called .* thief)\b", "staff misconduct", 0.95
        ),
        _compile_rule(
            r"\b(gaali|shivya|thitt|chilla|kathi|orad|misbehav|badtameez|uddhat|chor\b)\b", "abusive staff", 0.95
        ),
        _compile_rule(
            r"\b(deliberate(ly)? overcharg(ed|ing)?|cheating customers|pushed customer)\b", "cheating/aggression", 0.92
        ),
    ],
    # IT05: Staff welfare grievance
    CATEGORY_IT05: [
        _compile_rule(
            r"\b(salary (not|delay)|sambalam|pagar|weekly off|overtime|uniform issue|no break)\b", "staff welfare", 0.90
        ),
        _compile_rule(r"\b(incentive delay|leave cancelled|staff break)\b", "staff grievance", 0.88),
    ],
    # IT06: Hygiene lapse (pests, dirty food areas, foul smell)
    CATEGORY_IT06: [
        _compile_rule(
            r"\b(cockroach|karappan|jhur|\brats?\b|chuh|undir|\beli\b|flies|makkhi|mashya|pest(s)?)\b",
            "pest detected",
            0.95,
        ),
        _compile_rule(
            r"\b(filthy|unhygien(ic)?|dirty food|foul smell|badbu|naatram|ghaan|dirty washroom)\b",
            "hygiene lapse",
            0.90,
        ),
        _compile_rule(r"\b(droppings|rat poo|stinking|garbage in aisle)\b", "unclean store", 0.88),
    ],
    # IT07: Store untidy / poor upkeep
    CATEGORY_IT07: [
        _compile_rule(
            r"\b(cartons? (lying )?in (every )?aisle|untidy|clutter|messy shelves|unlabelled)\b", "store untidy", 0.88
        ),
        _compile_rule(r"\b(bikhr|kalanju|pasara|godown mess|cannot find anything)\b", "aisles messy", 0.85),
    ],
    # IT08: Physical safety hazard (wet floor, wiring, falling stock)
    CATEGORY_IT08: [
        _compile_rule(
            r"\b(wet floor|loose wire|exposed wire|electric(al)? spark|fire hazard|blocked fire exit)\b",
            "safety hazard",
            0.95,
        ),
        _compile_rule(
            r"\b(slip|falling stock|trip hazard|broken glass (on floor)?|no caution board)\b", "slip/trip hazard", 0.92
        ),
        _compile_rule(r"\b(fisal|vazhuk|ghasar|geela|shock kottindi)\b", "wet floor / shock", 0.90),
    ],
    # IT09: Roof leak / water seepage
    CATEGORY_IT09: [
        _compile_rule(
            r"\b(roof leak(ing)?|water seepage|water dripping (from ceiling)?|bucket(s)? in aisle)\b", "roof leak", 0.92
        ),
        _compile_rule(r"\b(tapak|ozhug|galt|seelan|ceiling drip)\b", "water seepage", 0.90),
    ],
    # IT10: Refrigeration / cold-chain failure
    CATEGORY_IT10: [
        # Explicit cooling failures on refrigeration units (with auxiliary verbs & adverbs)
        _compile_rule(
            r"\b(refrigerator|fridge|chiller|freezer|deep freezer|cold storage)\b.*?\b(not cooling|not working|broken|down|off|warm|faulty|stopped|leaking|properly)\b",
            "refrigeration cooling failure",
            0.95,
        ),
        _compile_rule(
            r"\b(not cooling|cooling problem|temperature high|chiller showing \d+)\b.*?\b(refrigerator|fridge|chiller|freezer)\b",
            "fridge not cooling",
            0.92,
        ),
        # Food safety consequences: spoiled dairy/frozen products directly tied to refrigeration
        _compile_rule(
            r"\b(refrigerator|fridge|chiller|freezer)\b.*?\b(spoiled|sour|bad|warm)\b.*?\b(milk|curd|dairy|ice cream)\b",
            "refrigeration spoiled dairy",
            0.95,
        ),
        _compile_rule(
            r"\b(spoiled|sour|warm)\b.*?\b(milk|curd|dairy)\b.*?\b(refrigerator|fridge|chiller|cooling)\b",
            "spoiled milk cooling failure",
            0.95,
        ),
        _compile_rule(
            r"\bice cream\b.*?\b(soft|dripping|melted|melting|thawed)\b|\b(melted|thawed|soft) ice cream\b",
            "thawed/melted ice cream",
            0.92,
        ),
        _compile_rule(
            r"\bchiller showing \d+|\bfreezer showing \d+|\bchiller temperature\b", "chiller temperature issue", 0.92
        ),
        # Telugu and Indian multilingual expressions
        _compile_rule(
            r"\b(refrigerator|fridge) (cooling ledu|aagipoyindi|pani cheyatledu)\b", "fridge cooling ledu", 0.92
        ),
        _compile_rule(r"\b(freezer|chiller) (pani cheyatledu|work avvatledu)\b", "chiller work avvatledu", 0.92),
        _compile_rule(r"\b(ice cream pighal|urugi|vitalun|ice cream karigipoindi)\b", "ice cream melted", 0.90),
        _compile_rule(r"\b(cold[- ]chain failure|temperature issue in dairy)\b", "cold-chain failure", 0.90),
    ],
    # IT11: Equipment breakdown (AC, lift, lights, scale, POS)
    CATEGORY_IT11: [
        _compile_rule(
            r"\b(a/c|ac|air condition(ing|er)?)\b.*?\b(not working|broken|down|off|leaking|work avvatledu|pani cheyatledu)\b",
            "ac broken",
            0.90,
        ),
        _compile_rule(
            r"\b(a/c|ac|air condition(ing|er)?) (is |was )?(not working|broken|down|off|leaking)\b", "ac broken", 0.90
        ),
        _compile_rule(
            r"\b(lift|elevator|escalator) (is |was )?(not working|broken|stuck|out of order)\b", "lift broken", 0.90
        ),
        _compile_rule(
            r"\b(weighing scale|barcode scanner|scanner|pos machine|card machine|printer) (is |was )?(broken|broke down|down|not working|not reading)\b",
            "equipment breakdown",
            0.90,
        ),
        _compile_rule(r"\b(trolley|cart) wheel (broken|jammed|not moving)\b", "trolley broken", 0.88),
        _compile_rule(
            r"\b(ac pani cheyatledu|scanner work avvatledu|scale pani cheyatledu)\b", "equipment pani cheyatledu", 0.90
        ),
    ],
    # IT12: Carry-bag charge / checkout packing
    CATEGORY_IT12: [
        _compile_rule(
            r"\b(carry bag|paper bag|charged for bag|bag charge|packing at checkout|eggs packed under)\b",
            "carry-bag / packing",
            0.90,
        ),
        _compile_rule(r"\b(charged rs \d+ for bag|bag bina pooche)\b", "unauthorized bag charge", 0.90),
    ],
    # IT13: Parking, access or store timings
    CATEGORY_IT13: [
        _compile_rule(r"\b(parking space|no parking|car park|parking issue|parking guard)\b", "parking issue", 0.90),
        _compile_rule(r"\b(opened late|closed early|store timings?|store closed before)\b", "store timings", 0.88),
        _compile_rule(r"\b(parking space ledhu|parking ledu|parking kashtam)\b", "parking ledu", 0.90),
        _compile_rule(r"\b(wheelchair ramp|wheelchair access|ramp blocked)\b", "store access ramp", 0.88),
    ],
    # IT14: Out of stock / empty shelves
    CATEGORY_IT14: [
        _compile_rule(
            r"\bout[- ]of[- ]stock\b|\bno[- ]stock\b|\bnot in stock\b|\bempty shelves\b", "out of stock", 0.90
        ),
        _compile_rule(
            r"\b(completely |currently )?unavailable\b|\bsold[- ]out\b|\bran out of\b", "item unavailable", 0.88
        ),
        _compile_rule(r"\b(need to restock|never in stock|zero inventory|milk over by)\b", "need restock", 0.88),
        _compile_rule(
            r"\b(stock ledhu|stock ledu|stock aipoyindi|items levu|shelves khali|dorakatledu)\b", "stock ledu", 0.92
        ),
        _compile_rule(r"\boos\b|\bkhaali\b|\brikam\b|\bkhatam\b|\bsampla\b", "out of stock short", 0.85),
    ],
    # IT15: Poor quality fresh produce
    CATEGORY_IT15: [
        _compile_rule(
            r"\b(rotten|stale|mouldy|moldy|fungus|worms inside) (tomatoes|fruits|veggies|vegetables|bananas|onions|bread)\b",
            "rotten fresh produce",
            0.92,
        ),
        _compile_rule(
            r"\b(half the tomatoes|bananas black inside|rotten vegetables|stale produce)\b", "poor fresh quality", 0.90
        ),
        _compile_rule(
            r"\b(sade|azhugi|sadle|baasi|shila|fruits rotten ga unnai|kullipoina)\b", "rotten fruits/veggies", 0.90
        ),
    ],
    # IT16: Expired / near-expiry product on shelf
    CATEGORY_IT16: [
        _compile_rule(
            r"\b(expired|past expiry|date datipoyindi|use-by date|expiry date passed)\b",
            "expired product on shelf",
            0.92,
        ),
        _compile_rule(
            r"\b(expired milk|expired bread|expired biscuits|old stock not rotated)\b", "expired item sold", 0.92
        ),
        _compile_rule(r"\b(fefo violated|sold past expiry)\b", "past expiry", 0.90),
    ],
    # IT17: Foreign object / contamination in product
    CATEGORY_IT17: [
        _compile_rule(
            r"\b(worm|insects?|keed[ae]?|stone|pathar|glass piece|plastic shard|metal pin|hair|foreign object)\b.*?\b(in|inside)\b.*?\b(atta|rice|packet|food|product|bread|flour|cereal)\b",
            "foreign object contamination",
            0.95,
        ),
        _compile_rule(
            r"\b(found worms in|small stone in|kaanch ka piece|mudi in food|dead insect|foreign body in)\b",
            "contamination in product",
            0.95,
        ),
    ],
    # IT18: Allergen / ingredient labelling error
    CATEGORY_IT18: [
        _compile_rule(
            r"\b(allergen|green veg dot|wrong veg mark|ingredient label|sesame present but|contains egg)\b",
            "allergen / labelling error",
            0.95,
        ),
        _compile_rule(r"\b(label does not match|missing allergen|non-veg mark on veg)\b", "mislabelled allergen", 0.92),
    ],
    # IT19: Shelf price vs bill price mismatch
    CATEGORY_IT19: [
        _compile_rule(
            r"\b(shelf price|shelf tag|price on shelf|tag said .* billed|price mismatch)\b", "price mismatch", 0.90
        ),
        _compile_rule(
            r"\b(old price tag|charged more than tag|shelf said rs \d+ billed)\b", "shelf tag difference", 0.90
        ),
    ],
    # IT20: Promotion / offer not applied
    CATEGORY_IT20: [
        _compile_rule(
            r"\b(offer not applied|buy 1 get 1|bogo not given|discount not applied|promo code not given|% off not applied)\b",
            "promotion not applied",
            0.90,
        ),
        _compile_rule(r"\b(advertised offer not given|combo discount missing)\b", "offer missing", 0.88),
    ],
    # IT21: Private-label product quality
    CATEGORY_IT21: [
        _compile_rule(
            r"\b(saffron select|saffron kitchen|own brand|store brand quality|makes hard rotis|packet half empty)\b",
            "private label quality",
            0.90,
        ),
    ],
    # IT22: Assortment request / product not carried
    CATEGORY_IT22: [
        _compile_rule(
            r"\b(please keep|do not carry|not stocking|sugar-free option|jain product|assortment|rakho|variety please)\b",
            "assortment request",
            0.88,
        ),
    ],
    # IT23: Online order delivery delay / missed slot
    CATEGORY_IT23: [
        _compile_rule(
            r"\b(delivery late|missed slot|ordered for .* came|delivery delay|order still not delivered)\b",
            "delivery delay",
            0.90,
        ),
    ],
    # IT24: Wrong or missing items in online order
    CATEGORY_IT24: [
        _compile_rule(
            r"\b(items? missing from (my )?order|wrong item (delivered)?|wrong variant|substituted without consent)\b",
            "wrong/missing delivery item",
            0.90,
        ),
        _compile_rule(r"\b(galat saman|thappana porul|different brand delivered)\b", "wrong item delivered", 0.88),
    ],
    # IT25: Damaged or leaking items on delivery
    CATEGORY_IT25: [
        _compile_rule(
            r"\b(oil pouch leaking|eggs broken in delivery|arrived crushed|torn delivery bag|leaking all over)\b",
            "damaged delivery goods",
            0.92,
        ),
    ],
    # IT26: App / website crash, login or bug
    CATEGORY_IT26: [
        _compile_rule(
            r"\b(app (crashes|crashing|not opening)|otp not coming|website bug|login problem|cart error)\b",
            "app / website issue",
            0.90,
        ),
    ],
    # IT27: Payment failure / money debited but order failed
    CATEGORY_IT27: [
        _compile_rule(
            r"\b(money debited|amount deducted|payment failed|upi failed .* deducted|charged twice)\b",
            "payment failure",
            0.92,
        ),
        _compile_rule(r"\b(kat gaye|cut aay|katle paise|double debit)\b", "money deducted no order", 0.90),
    ],
    # IT28: Refund / return not processed
    CATEGORY_IT28: [
        _compile_rule(
            r"\b(refund pending|refund not received|returned item but no refund|refund delay)\b",
            "refund not processed",
            0.90,
        ),
    ],
    # IT29: Loyalty points / coupon problem
    CATEGORY_IT29: [
        _compile_rule(
            r"\b(points not credited|loyalty points|rewards not credited|coupon code (invalid|not working))\b",
            "loyalty points problem",
            0.90,
        ),
    ],
    # IT30: Billing error at counter (double scan, wrong weight/qty)
    CATEGORY_IT30: [
        _compile_rule(
            r"\b(scanned twice|milk scanned twice|item scanned 2 times|billed \d+ kg .* took \d+ kg|wrong weight billed)\b",
            "counter billing error",
            0.92,
        ),
        _compile_rule(r"\b(double scan|do baar scan|rendu dhadava scan)\b", "double scan at till", 0.90),
    ],
    # NI01: Praise / compliment
    CATEGORY_NI01: [
        _compile_rule(
            r"\b(great store|staff very helpful|fresh veggies today|love this store|excellent service|superb experience)\b",
            "praise/compliment",
            0.90,
        ),
        _compile_rule(r"\b(chala bagundi|accha store|nalla service|wonderful shopping)\b", "compliment", 0.88),
    ],
    # NI03: Spam / irrelevant
    CATEGORY_NI03: [
        _compile_rule(
            r"\b(earn \d+|telegram|click link|crypto|loan offer|kamao daily|subscribe to|follow on instagram)\b",
            "spam / advert",
            0.95,
        ),
        _compile_rule(r"^(\s*([a-z])\2{3,}\s*|asdf|qwerty)$", "gibberish text", 0.95),
    ],
    # NI02: General comment / suggestion / question
    CATEGORY_NI02: [
        _compile_rule(
            r"\b(when will you open|opening hours question|general question|handover done|all ok)\b",
            "general inquiry",
            0.85,
        ),
    ],
}


def compute_severity(category: str, text: str) -> str:
    """Calculates R5 policy severity: max(policy_floor, impact)."""
    meta = TAXONOMY_METADATA.get(category, {})
    floor = meta.get("policy_floor", "low")
    if category in NON_ACTIONABLE_CATEGORIES:
        return "low"
    if CRITICAL_WORDS.search(text) and floor in ("high", "medium"):
        return "critical"
    return floor


def compute_actionable(category: str, text: str) -> int:
    """Assigns R5 actionability: 0 for NI01-NI03; 1 for specific operational issues."""
    if category in NON_ACTIONABLE_CATEGORIES:
        return 0
    return 1 if len(text.strip()) >= 5 else 0


def classify_text(raw_text: str | None) -> ClassificationResult:
    """
    Classifies retail feedback across all 33 official R5 categories.
    Transparent, rule-based heuristic scoring without fabricated Bayesian probabilities.
    """
    original = raw_text if raw_text is not None else ""
    cleaned = clean_text(original)

    if not cleaned:
        return ClassificationResult(
            original_text=original,
            cleaned_text="",
            category=CATEGORY_NI02,
            confidence=0.0,
            needs_review=True,
            matched_terms=[],
            severity="low",
            actionable=0,
            owner_function="None (not actionable)",
            category_name=TAXONOMY_METADATA[CATEGORY_NI02]["name"],
        )

    category_scores: dict[str, float] = {}
    category_matches: dict[str, list[str]] = {}

    for cat, rules in RULES.items():
        matched_terms: list[str] = []
        max_weight = 0.0

        for rule in rules:
            if rule.pattern.search(cleaned):
                if rule.display_term not in matched_terms:
                    matched_terms.append(rule.display_term)
                max_weight = max(max_weight, rule.weight)

        if matched_terms:
            bonus = min(0.10, (len(matched_terms) - 1) * 0.05)
            final_score = round(min(0.95, max_weight + bonus), 2)
            category_scores[cat] = final_score
            category_matches[cat] = matched_terms

    # Check praise vs complaints: If praise matched along with a real issue, prioritize the issue
    if len(category_scores) > 1 and CATEGORY_NI01 in category_scores:
        operational_cats = [c for c in category_scores if c != CATEGORY_NI01]
        if operational_cats:
            del category_scores[CATEGORY_NI01]

    # No matches -> default to NI02 with needs_review
    if not category_scores:
        return ClassificationResult(
            original_text=original,
            cleaned_text=cleaned,
            category=CATEGORY_NI02,
            confidence=0.0,
            needs_review=True,
            matched_terms=[],
            severity="low",
            actionable=0,
            owner_function="None (not actionable)",
            category_name=TAXONOMY_METADATA[CATEGORY_NI02]["name"],
        )

    # Sort descending
    sorted_cats = sorted(category_scores.items(), key=lambda item: item[1], reverse=True)
    top_cat, top_score = sorted_cats[0]

    # Handle multi-intent collisions:
    # If IT10 matched, food spoilage is part of IT10 definition, so do not flag artificial conflict with IT15/IT16
    is_conflict = False
    conflict_terms: list[str] = category_matches[top_cat]

    if len(sorted_cats) > 1:
        second_cat, second_score = sorted_cats[1]
        # Ignore false collision between IT10 and IT15/IT16
        if top_cat == CATEGORY_IT10 and second_cat in (CATEGORY_IT15, CATEGORY_IT16):
            is_conflict = False
        elif second_score >= 0.70:
            is_conflict = True
            conflict_terms = list(dict.fromkeys(category_matches[top_cat] + category_matches[second_cat]))

    meta = TAXONOMY_METADATA.get(top_cat, TAXONOMY_METADATA[CATEGORY_NI02])
    severity = compute_severity(top_cat, cleaned)
    actionable = compute_actionable(top_cat, cleaned)

    if is_conflict:
        return ClassificationResult(
            original_text=original,
            cleaned_text=cleaned,
            category=top_cat,
            confidence=CONFLICT_CONFIDENCE_SCORE,
            needs_review=True,
            matched_terms=conflict_terms,
            severity=severity,
            actionable=actionable,
            owner_function=meta["owner"],
            category_name=meta["name"],
        )

    needs_review = top_score < MIN_CONFIDENCE_THRESHOLD

    return ClassificationResult(
        original_text=original,
        cleaned_text=cleaned,
        category=top_cat,
        confidence=top_score,
        needs_review=needs_review,
        matched_terms=category_matches[top_cat],
        severity=severity,
        actionable=actionable,
        owner_function=meta["owner"],
        category_name=meta["name"],
    )
