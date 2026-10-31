# StoreGrid: Priority & Trend Detection Module

> **Hackathon Module:** Priority & Trend Detection  
> **Status:** Completed, tested, and ready for integration  
> **Tech Stack:** Plain Node.js (zero external dependencies required)  
> **Data Notice:** All sample data in `sampleData.json` is **synthetic/fictional** for development and automated testing.

---

## 1. Overview & Capabilities

This module is designed to operate completely independently from other teammates' code and backend database infrastructure. It takes in raw complaint records (JSON) and produces rich, dashboard-ready analytics:

1. **Store-wise and Category-wise Counts:** Aggregates totals across stores and across all 7 agreed categories (`STOCK_SHORTAGE`, `BILLING_DELAY`, `STAFF_BEHAVIOUR`, `PRODUCT_QUALITY`, `EQUIPMENT_FAILURE`, `OTHER`, `NEEDS_REVIEW`).
2. **Sudden Spike Detection:** Compares complaint volumes between a recent time window (e.g., last 24h) and a preceding baseline window (24h to 48h ago) to detect emerging surges or volume multipliers (default $\ge 2.0\times$ surge).
3. **Rule-Based Explainable Priority Scoring:** Computes a score from 0 to 100 and assigns priority bands (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) with an explicit breakdown of why points were assigned.
4. **Recurring Complaint Detection:** Flags repeat incidents when a similar issue recurs within 14 days after a previous complaint was resolved.
5. **Resilient Field Handling:** Automatically sanitizes missing IDs, invalid timestamps, and unknown categories (normalizing unknown categories to `NEEDS_REVIEW`).
6. **Dashboard-Ready Output:** Formats everything into a structured JSON response suitable for direct consumption by frontend cards, charts, and alert banners.

---

## 2. Folder Structure

```text
Storegrid/
└── priority-trends/
    ├── constants.js          # Categories, priority bands, base weights, and default config
    ├── validator.js          # Data sanitization, fallbacks, and schema validation
    ├── counters.js           # Store-wise & category-wise counting and matrix calculations
    ├── spikeDetector.js      # Sliding time-window spike detection
    ├── recurringDetector.js  # Evidence-based recurring issue detection
    ├── priorityScorer.js     # Rule-based scoring engine with explainability
    ├── index.js              # Main orchestrator (single import for Express)
    ├── sampleData.json       # Synthetic test dataset with 17 realistic records
    ├── demo.js               # Visual terminal demonstration
    ├── README.md             # Beginner-friendly documentation and guide
    └── tests/
        └── runTests.js       # 15 automated test cases using Node's built-in assert
```

---

## 3. How to Run the Tests & Demonstration

No `npm install` is required. The module uses standard built-in Node.js features.

### Step 1: Ensure Node.js is Accessible

If `node` is already in your PATH, you can run commands directly. If your terminal says `node: command not found`, run this first in PowerShell:

```powershell
$env:Path = "C:\Users\srith\AppData\Local\Programs\nodejs;" + $env:Path
```

### Step 2: Run Automated Tests

To execute the 21-test automated verification suite:

```powershell
node priority-trends/tests/runTests.js
```

**Expected output:**
```text
======================================================
  StoreGrid: Priority & Trend Detection Test Suite
======================================================
...
  Test Results: 21/21 Passed (0 Failed)
======================================================
```

### Step 3: Run the Demonstration

To see a formatted dashboard report printed in your console using the synthetic dataset:

```powershell
node priority-trends/demo.js
```

---

## 4. Input & Output JSON Formats

### Sample Input Complaint Object

```json
{
  "id": "CMP-1002",
  "storeId": "STORE-01",
  "category": "EQUIPMENT_FAILURE",
  "status": "OPEN",
  "createdAt": "2026-10-15T08:30:00.000Z",
  "resolvedAt": null,
  "subject": "POS Terminal 2 touchscreen freeze recurring",
  "details": "POS Terminal 2 is freezing again after 4 days of resolution. Smoke smell reported.",
  "itemOrAssetId": "POS-TERM-02"
}
```

### Sample Output (Dashboard-Ready JSON)

Calling `analyzeComplaints(complaints)` returns:

```json
{
  "metadata": {
    "generatedAt": "2026-10-17T06:23:40.123Z",
    "totalInput": 17,
    "validComplaints": 17,
    "status": "SUCCESS"
  },
  "summary": {
    "totalComplaints": 17,
    "openComplaints": 12,
    "inProgressComplaints": 1,
    "resolvedComplaints": 4,
    "criticalPriorityCount": 1,
    "highPriorityCount": 0,
    "mediumPriorityCount": 3,
    "lowPriorityCount": 13,
    "activeSpikesCount": 1,
    "recurringComplaintsCount": 1
  },
  "storeWiseCounts": {
    "STORE-01": 8,
    "STORE-02": 4,
    "STORE-03": 5
  },
  "categoryWiseCounts": {
    "STOCK_SHORTAGE": 2,
    "BILLING_DELAY": 5,
    "STAFF_BEHAVIOUR": 2,
    "PRODUCT_QUALITY": 2,
    "EQUIPMENT_FAILURE": 3,
    "OTHER": 1,
    "NEEDS_REVIEW": 2
  },
  "spikes": [
    {
      "storeId": "STORE-01",
      "category": "BILLING_DELAY",
      "recentCount": 4,
      "previousCount": 1,
      "ratio": 4.0,
      "severity": "HIGH",
      "alertMessage": "Sudden 4x spike in BILLING_DELAY at STORE-01 (4 recent vs 1 in previous 24h)"
    }
  ],
  "recurringIssues": [
    {
      "complaintId": "CMP-1002",
      "storeId": "STORE-01",
      "category": "EQUIPMENT_FAILURE",
      "subject": "POS Terminal 2 touchscreen freeze recurring",
      "itemOrAssetId": "POS-TERM-02",
      "previousComplaintId": "CMP-1001",
      "daysSinceResolution": 3.8,
      "evidence": "Both complaints reference identical asset/item ID: 'POS-TERM-02'"
    }
  ],
  "unresolvedPrioritizedComplaints": [
    {
      "id": "CMP-1002",
      "storeId": "STORE-01",
      "status": "OPEN",
      "priority": { "score": 80, "level": "CRITICAL" }
    }
  ],
  "prioritizedComplaints": [
    {
      "id": "CMP-1002",
      "storeId": "STORE-01",
      "category": "EQUIPMENT_FAILURE",
      "priority": {
        "score": 80,
        "level": "CRITICAL",
        "explanations": [
          "Base weight for category EQUIPMENT_FAILURE: +35 pts",
          "Recurring issue detected (+25 pts): Matches resolved complaint CMP-1001 (EXACT_ASSET_MATCH)",
          "Aging complaint (+10 pts): Unresolved for 51 hours (> 48h)",
          "High-impact keyword(s) matched [smoke, freeze]: +10 pts"
        ]
      }
    }
  ]
}
```

---

## 5. Rules & Business Logic Explained

### A. How Recurring Issues Are Determined

To prevent false accusations, the system **never** marks complaints as recurring purely because they occurred in the same store and category.

A complaint is marked as recurring **only** when all of the following hold true:
1. **Same Store & Category:** Both share `storeId` and `category`.
2. **Prior Resolution:** The earlier complaint was explicitly marked `RESOLVED` or `CLOSED` with a resolution timestamp.
3. **Within Recurrence Window:** The new complaint occurred after the prior resolution, but within 14 days (customizable).
4. **Concrete Issue Evidence:**
   - **Highest Confidence (`EXACT_ASSET_MATCH`):** Both complaints share the identical `itemOrAssetId` (e.g., `"POS-TERM-02"`). If they have different asset IDs, recurrence is rejected.
   - **Strong Confidence (`IDENTICAL_SPECIFIC_SUBJECT`):** If no asset ID exists, both complaints share an identical non-trivial subject.

### B. Priority Scoring Rules (0 - 100)

| Factor | Points | Reason / Criteria |
| :--- | :--- | :--- |
| **Category Base Severity** | +10 to +35 | `EQUIPMENT_FAILURE` (+35), `PRODUCT_QUALITY` (+30), `BILLING_DELAY` (+25), `STOCK_SHORTAGE` (+20), `STAFF_BEHAVIOUR` (+20), `NEEDS_REVIEW` (+15), `OTHER` (+10) |
| **Recurring Issue** | +25 | Incident has happened again after previous resolution |
| **Active Category Spike** | +20 | Complaint belongs to an active spike currently impacting that store |
| **Aging (> 48 hours)** | +10 | Open and unresolved for over 2 days |
| **Aging (24 - 48 hours)**| +5 | Open and unresolved for over 1 day |
| **Urgent Keywords** | +10 | Matches urgency words (e.g., `smoke`, `fire`, `leak`, `spoilage`, `overcharge`) |

- **CRITICAL:** Score $\ge 80$
- **HIGH:** Score $60 - 79$
- **MEDIUM:** Score $35 - 59$
- **LOW:** Score $< 35$

---

## 6. How to Integrate with Express.js Later

When integrating into the team's Express backend, the module accepts raw database query rows (snake_case) or API request payloads directly:

```javascript
// Example Express Routes (e.g. in routes/analytics.js)
const express = require('express');
const router = express.Router();
const { analyzeComplaints } = require('../priority-trends');

// Option A: POST endpoint receiving JSON complaints from client or another service
router.post('/priority-trends', (req, res) => {
  try {
    // Accepts array directly or wrapper object: { complaints: [...] } / { data: [...] }
    const complaintsInput = req.body;
    const dashboardData = analyzeComplaints(complaintsInput);
    return res.status(200).json(dashboardData);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to analyze complaints' });
  }
});

// Option B: GET endpoint retrieving complaint rows directly from PostgreSQL
router.get('/priority-trends', async (req, res) => {
  try {
    // 1. Fetch complaints from PostgreSQL (snake_case column names are supported automatically)
    // const { rows } = await db.query('SELECT id, store_id, category, status, created_at, resolved_at, subject, details, item_id FROM complaints');
    const rows = []; // replace with database result

    // 2. Run analysis
    const dashboardData = analyzeComplaints(rows);

    // 3. Return JSON to dashboard
    return res.status(200).json(dashboardData);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve analytics' });
  }
});

module.exports = router;
```

---

## 7. Assumptions & Notes

1. **No External Dependencies:** Uses standard JavaScript and Node.js built-ins (`assert`, `Date`, `Math`).
2. **Database Agnostic:** Operates on in-memory JSON arrays, so your teammates can pull from PostgreSQL, MongoDB, or local files and pass the array directly into `analyzeComplaints()`.
3. **Resilience:** Unrecognized categories automatically map to `NEEDS_REVIEW` with an informative warning without crashing the server.
