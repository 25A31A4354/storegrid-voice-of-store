# StoreGrid: Priority & Trend Detection Integration Guide

> **Module:** Priority & Trend Detection  
> **Location:** `priority-trends/`  
> **Status:** Production-ready for integration (21/21 automated tests passing, 0 external dependencies)  
> **Audience:** Backend (Express + PostgreSQL) and Frontend (Dashboard) developers

---

## 1. Module Purpose & Implemented Features

This module independently ingests store complaints and computes real-time operational risk intelligence for store managers and headquarters dashboards.

### Five Core Features
1. **Store-wise & Category-wise Aggregation:** Computes totals per store and across all 7 agreed categories (`STOCK_SHORTAGE`, `BILLING_DELAY`, `STAFF_BEHAVIOUR`, `PRODUCT_QUALITY`, `EQUIPMENT_FAILURE`, `OTHER`, `NEEDS_REVIEW`). Unencountered categories always initialize to `0`.
2. **Sudden Complaint Spike Detection:** Compares recent complaint frequency (e.g. last 24h) against the preceding baseline window (24h–48h ago) to detect volume surges ($\ge 2.0\times$ increase with $\ge 3$ complaints, or sudden emerging surges from zero).
3. **Rule-Based Explainable Priority Scoring (0–100):** Assigns priority bands (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and generates an explainable breakdown array detailing the exact points awarded (category severity, recurring status, active spikes, aging, urgency keywords).
4. **Evidence-Based Recurring Complaint Detection:** Detects repeat failures occurring within 14 days after a previous complaint was resolved at the same store/category, backed by concrete evidence (identical asset/item ID or matching specific issue subject).
5. **Dashboard-Ready Analytics Output:** Generates structured JSON formatted for dashboard cards, charts, alerts, and operational action queues.

---

## 2. Input Complaint Schema

The module accepts an array of complaints directly, or an object containing `{ complaints: [...] }` or `{ data: [...] }`.

### Field Specifications & Aliases

| Field | Type | Required? | Accepted Aliases | Description / Fallback |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | Recommended | `complaint_id`, `complaintId` | Unique ticket ID. Fallback: `CMP-GEN-<index>` |
| `storeId` | String | Recommended | `store_id`, `store` | Store identifier (e.g., `"STORE-01"`). Fallback: `'UNKNOWN_STORE'` |
| `category` | String | Recommended | `predicted_category`, `predictedCategory`, `label` | One of the 7 valid categories. Invalid/missing values normalize to `'NEEDS_REVIEW'` |
| `status` | String | Optional | `state` | `'OPEN'`, `'IN_PROGRESS'`, `'RESOLVED'`, `'CLOSED'`. Default: `'OPEN'` |
| `createdAt` | ISO / Date | Recommended | `created_at`, `timestamp`, `date` | Timestamp when complaint was filed. Fallback: current time |
| `resolvedAt` | ISO / Date | Optional | `resolved_at`, `closedAt`, `closed_at` | Timestamp when complaint was resolved. If status is `RESOLVED` and missing, defaults to `createdAt` |
| `subject` | String | Optional | `title`, `headline` | Complaint subject line or short summary |
| `details` | String | Optional | `description`, `text`, `content`, `message` | Long-form customer feedback or technician notes |
| `itemOrAssetId` | String | Optional | `item_or_asset_id`, `itemId`, `item_id`, `assetId`, `asset_id` | Specific equipment, POS register, or SKU identifier (e.g., `"POS-TERM-02"`) |

### Example Input Object

```json
{
  "id": "CMP-1002",
  "store_id": "STORE-01",
  "category": "EQUIPMENT_FAILURE",
  "status": "OPEN",
  "created_at": "2026-10-15T08:30:00.000Z",
  "resolved_at": null,
  "subject": "POS Terminal 2 touchscreen freeze recurring",
  "details": "POS Terminal 2 is freezing again after 4 days of resolution. Smoke smell reported.",
  "item_id": "POS-TERM-02"
}
```

---

## 3. Output JSON Structure

Calling `analyzeComplaints(complaints, options)` returns:

```json
{
  "metadata": {
    "generatedAt": "2026-10-17T11:00:00.000Z",
    "totalInput": 17,
    "validComplaints": 17,
    "referenceTimeUsed": "2026-10-17T11:00:00.000Z",
    "status": "SUCCESS"
  },
  "summary": {
    "totalComplaints": 17,
    "openComplaints": 12,
    "inProgressComplaints": 1,
    "resolvedComplaints": 4,
    "criticalPriorityCount": 1,
    "highPriorityCount": 0,
    "mediumPriorityCount": 8,
    "lowPriorityCount": 8,
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
      "category": "EQUIPMENT_FAILURE",
      "status": "OPEN",
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
  ],
  "prioritizedComplaints": [ /* All complaints, including historical resolved records */ ],
  "dashboardAlerts": [
    {
      "type": "SPIKE_WARNING",
      "severity": "HIGH",
      "message": "Sudden 4x spike in BILLING_DELAY at STORE-01 (4 recent vs 1 in previous 24h)"
    }
  ],
  "validationWarnings": []
}
```

---

## 4. Public Exports & Module Import

Import the module in any Node.js / Express file:

```javascript
// High-level pipeline import
const { analyzeComplaints } = require('../priority-trends');

// Or import specific modular components if needed
const {
  calculateCounts,
  detectSpikes,
  detectRecurringComplaints,
  scoreComplaint,
  CATEGORIES,
  PRIORITY_LEVELS
} = require('../priority-trends');
```

---

## 5. Recommended Express API Routes

Create an Express router (e.g. `src/routes/analyticsRoutes.js`):

```javascript
const express = require('express');
const router = express.Router();
const { analyzeComplaints } = require('../priority-trends');
const db = require('../db'); // Your PostgreSQL pool/client

/**
 * GET /api/analytics/priority-trends
 * Fetches complaints from PostgreSQL and returns analytics
 */
router.get('/priority-trends', async (req, res) => {
  try {
    // 1. Query records from PostgreSQL
    const query = `
      SELECT 
        id, 
        store_id, 
        category, 
        status, 
        created_at, 
        resolved_at, 
        subject, 
        details, 
        item_id AS "itemOrAssetId"
      FROM complaints
      ORDER BY created_at DESC;
    `;
    const { rows } = await db.query(query);

    // 2. Run analysis
    const analytics = analyzeComplaints(rows);

    return res.status(200).json(analytics);
  } catch (error) {
    console.error('Priority & Trends Error:', error);
    return res.status(500).json({ error: 'Failed to generate priority and trend analytics' });
  }
});

/**
 * POST /api/analytics/priority-trends/evaluate
 * Evaluates an in-flight array of complaints sent in request body
 */
router.post('/priority-trends/evaluate', (req, res) => {
  try {
    const analytics = analyzeComplaints(req.body);
    return res.status(200).json(analytics);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid complaint payload' });
  }
});

module.exports = router;
```

---

## 6. PostgreSQL & NLP Data Flow

```text
[Customer / Store]
       │ (Raw complaint text)
       ▼
[NLP Classifier Service] ──► Extracts: predicted_category, confidence, keywords
       │
       ▼
[PostgreSQL Database] ─────► Stores complaint row:
                             (id, store_id, category, status, created_at, resolved_at, subject, details, item_id)
       │
       ▼
[Priority & Trend Engine] ─► Ingests database rows via analyzeComplaints(rows)
                             - Calculates store/category counts
                             - Identifies sudden surges vs baseline window
                             - Matches recurring incidents after resolution
                             - Assigns 0-100 score + explainable reason breakdown
       │
       ▼
[StoreGrid Dashboard UI] ──► Displays KPIs, spike banners, priority action queues
```

---

## 7. Field Mapping Reference Table

| Teammate Source | Field Name | Maps To Engine Field | Notes |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | `store_id` | `storeId` | Supported automatically |
| **PostgreSQL** | `created_at` | `createdAt` | Supported automatically (Date or ISO string) |
| **PostgreSQL** | `resolved_at` | `resolvedAt` | Supported automatically |
| **PostgreSQL** | `item_id` / `asset_id` | `itemOrAssetId` | Supported automatically |
| **NLP Service** | `predicted_category` / `label` | `category` | Normalized to valid category or `NEEDS_REVIEW` |
| **NLP Service** | `title` / `headline` | `subject` | Supported automatically |
| **NLP Service** | `description` / `text` | `details` | Supported automatically |

---

## 8. Error Handling & Synthetic-Data Limitations

1. **Non-Blocking Fault Tolerance:**
   - Missing fields, unparseable dates, or unknown categories do not crash the module or throw uncaught errors.
   - Faults are safely normalized (e.g. unknown category $\rightarrow$ `NEEDS_REVIEW`) and recorded in `result.validationWarnings`.
2. **Synthetic Data vs. Real Team Data:**
   - `sampleData.json` contains **synthetic, fictional test data** designed to test spike thresholds and recurring edge cases.
   - **Action Item for Backend Devs:** Before final hackathon submission, run `analyzeComplaints()` against real sample records exported from your PostgreSQL database to confirm timestamp timezones (UTC vs local) and category alignment.

---

## 9. Integration Checklist

### For Backend Developers
- [ ] Mount the analytics router in `app.js` / `server.js` (`app.use('/api/analytics', analyticsRouter)`).
- [ ] Verify database query returns `created_at` and `resolved_at` timestamps.
- [ ] If using specific asset tracking, verify the column is aliased or named `item_id`, `asset_id`, or `itemOrAssetId`.
- [ ] Run automated tests to verify environment: `node priority-trends/tests/runTests.js`.

### For Frontend Developers
- [ ] Connect KPI cards to `result.summary` (`totalComplaints`, `criticalPriorityCount`, `activeSpikesCount`, `recurringComplaintsCount`).
- [ ] Render Top Alert Banners using `result.dashboardAlerts`.
- [ ] Render the **Operational Action Queue** using `result.unresolvedPrioritizedComplaints`.
- [ ] Display explainable priority reasons using `item.priority.explanations` on ticket detail views.
- [ ] Render Category Breakdown charts using `result.categoryWiseCounts`.
