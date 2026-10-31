# StoreGrid API Contracts & Integration Guide
**Talent AP Mega Hackathon 2026 R5 — Voice-of-Store Engine**

---

## 1. Team Responsibilities & System Architecture

| Teammate | Role | Core Responsibility | Primary Artifacts |
|---|---|---|---|
| **Vinay (Team Lead)** | Backend & DB Architect | Node/Express API, Relational DB schema, Prisma, migrations, fallbacks, integration contracts | `src/`, `prisma/`, `scripts/` |
| **Varshit** | NLP & Text Processing | Complaint classification, sentiment scoring, language detection (en, te-en) | NLP Service / Model Pipeline |
| **Sanjay** | Analytics & Intelligence | Priority scoring, spike detection, recurrence patterns, trend forecasting | Analytics / Math Engine |
| **Yashwant** | Frontend Engineer | React + Vite dashboard, live charts, triage workflow, CSV upload UI | `storegrid-frontend/` |

---

## 2. Standard Identifiers & Enums

All teammates must strictly adhere to these exact string identifiers across JSON payloads, database columns, and frontend UI states.

### Categories (`category` / `detectedCategory`)
- `STOCK_SHORTAGE` — Out of stock items, empty shelves, depleted inventory
- `BILLING_DELAY` — Slow checkout counters, long queues, payment gateway crashes
- `STAFF_BEHAVIOUR` — Employee conduct, courtesy, lack of aisle assistance, training issues
- `PRODUCT_QUALITY` — Expired stock, damaged packaging, rotten produce, defective goods
- `EQUIPMENT_FAILURE` — HVAC/AC breakdown, freezer leaks, scanner failure, elevator stuck
- `OTHER` — Retail feedback outside core operations (parking space, store hours, ambience, music)
- `NEEDS_REVIEW` — Unknown, conflicting, or unclassified feedback awaiting human/NLP triage

### Priorities (`priority`)
- `LOW` — Minor inconvenience, low customer impact
- `MEDIUM` — Standard operational item, 72h SLA target
- `HIGH` — Significant customer friction, 24h SLA target
- `CRITICAL` — Severe business disruption or safety hazard (e.g., store AC failure, slip hazard, multi-counter crash)

### Issue Statuses (`status`)
- `OPEN` — Issue logged, awaiting action or triage
- `IN_PROGRESS` — Assigned to owner team and actively being investigated
- `RESOLVED` — Root cause addressed, resolution notes documented, `resolvedAt` set
- `REOPENED` — Recurring or unresolved problem reopened with additional feedback

### Feedback Source Types (`sourceType`)
- `CUSTOMER_REVIEW` — Public or Google/App store customer reviews
- `STAFF_NOTE` — Floor staff or store manager internal notes
- `CALL_TRANSCRIPT` — Customer support phone call transcripts
- `CUSTOMER_SURVEY` — Post-purchase SMS or receipt surveys
- `KIOSK_FEEDBACK` — In-store digital feedback kiosks
- `WHATSAPP_CHAT` — Retail store WhatsApp helpline messages
- `OTHER` — General feedback

### Feedback Provenance (`provenance`)
- `SYNTHETIC_DEMO` — Fictional synthetic records created for testing and demonstration
- `OFFICIAL_DATASET` — Official 40,000 hackathon dataset (when provided)
- `MANUAL_ENTRY` — Created via API or manager dashboard
- `TEST` — Automated integration test data

### Owner Teams (`ownerTeam`)
- `STORE_OPS`
- `INVENTORY`
- `BILLING_TECH`
- `FACILITIES_MAINTENANCE`
- `HR_TRAINING`
- `CUSTOMER_SERVICE`
- `QUALITY_ASSURANCE`
- `UNASSIGNED`

---

## 3. Standard Response & Error Format

All API responses return consistent JSON structures.

### Success Response
```json
{
  "success": true,
  "data": { ... } // or array
}
```

### Error Response (HTTP 4xx / 5xx)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable error description",
    "details": ["Specific field error 1", "Specific field error 2"]
  }
}
```

---

## 4. API Endpoints Reference

### 4.1. Health Check
`GET /api/health`
- **Description:** Verifies backend liveness, uptime, and database connection mode (`postgresql` or `fallback`).
- **Response:** `200 OK`
```json
{
  "status": "ok",
  "service": "storegrid-backend",
  "version": "1.0.0",
  "environment": "development",
  "uptime": 142,
  "timestamp": "2026-10-16T15:20:00.000Z",
  "database": {
    "connected": true,
    "mode": "fallback",
    "isFallback": true,
    "notice": "Running with local SQLite relational fallback. PostgreSQL is not reachable locally."
  },
  "system": {
    "nodeVersion": "v24.18.0",
    "platform": "win32"
  }
}
```

---

### 4.2. Submit Single Feedback
`POST /api/feedback`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
```json
{
  "storeCode": "STR-HYD-001",
  "text": "Counter 3 billing is extremely slow. Waited in queue for 25 minutes!",
  "sourceType": "CUSTOMER_REVIEW",
  "rating": 1,
  "language": "en",
  "timestamp": "2026-10-16T14:30:00Z",
  "provenance": "SYNTHETIC_DEMO",
  "customerIdentifier": "CUST-9876",
  "metadata": {
    "device": "Mobile Web"
  }
}
```
- **Response:** `201 Created`
```json
{
  "success": true,
  "message": "Feedback submitted successfully",
  "data": {
    "id": "7f8b9a2c-1234-5678-abcd-ef0123456789",
    "storeId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "storeCode": "STR-HYD-001",
    "storeName": "StoreGrid Banjara Hills",
    "text": "Counter 3 billing is extremely slow. Waited in queue for 25 minutes!",
    "sourceType": "CUSTOMER_REVIEW",
    "timestamp": "2026-10-16T14:30:00.000Z",
    "rating": 1,
    "language": "en",
    "detectedCategory": "BILLING_DELAY",
    "sentiment": null,
    "processingStatus": "PENDING",
    "provenance": "SYNTHETIC_DEMO",
    "customerIdentifier": "CUST-9876",
    "metadata": { "device": "Mobile Web" },
    "createdAt": "2026-10-16T14:30:02.123Z",
    "updatedAt": "2026-10-16T14:30:02.123Z"
  }
}
```

---

### 4.3. Bulk Import Feedback (CSV File or JSON)
`POST /api/feedback/import`
- **Option A (Multipart file upload):** Form field `file` containing `.csv`.
- **Option B (Raw JSON string):**
```json
{
  "csvContent": "text,store_code,source_type,rating,category,provenance\n\"POS terminal frozen\",STR-HYD-001,STAFF_NOTE,,BILLING_DELAY,SYNTHETIC_DEMO",
  "provenance": "SYNTHETIC_DEMO"
}
```
- **Response:** `200 OK`
```json
{
  "success": true,
  "message": "CSV processing finished: 25 records imported, 0 errors.",
  "summary": {
    "totalProcessed": 25,
    "importedCount": 25,
    "failedCount": 0,
    "provenance": "SYNTHETIC_DEMO"
  },
  "sampleImported": [ ... ],
  "errors": []
}
```

---

### 4.4. List Feedback
`GET /api/feedback`
- **Query Parameters:**
  - `page`: integer (default `1`)
  - `limit`: integer (default `20`, max `100`)
  - `storeId`: string (Store UUID or code like `STR-HYD-001`)
  - `category`: string (`STOCK_SHORTAGE`, `BILLING_DELAY`, etc.)
  - `sourceType`: string (`CUSTOMER_REVIEW`, `STAFF_NOTE`, etc.)
  - `processingStatus`: string (`PENDING`, `PROCESSED`, `IGNORED`, `ERROR`)
  - `provenance`: string (`SYNTHETIC_DEMO`, `OFFICIAL_DATASET`, etc.)
  - `startDate`, `endDate`: ISO-8601 strings
  - `search`: string (free text search)
  - `sortBy`: `timestamp` | `rating` | `createdAt` (default `timestamp`)
  - `sortOrder`: `asc` | `desc` (default `desc`)
- **Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "7f8b9a2c-1234-5678-abcd-ef0123456789",
      "storeId": "a1b2c3d4-...",
      "storeCode": "STR-HYD-001",
      "storeName": "StoreGrid Banjara Hills",
      "text": "Freezer leaking puddle of water near ice cream counter",
      "sourceType": "CUSTOMER_REVIEW",
      "timestamp": "2026-10-15T15:00:00.000Z",
      "rating": 1,
      "language": "en",
      "detectedCategory": "EQUIPMENT_FAILURE",
      "sentiment": "NEGATIVE",
      "processingStatus": "PENDING",
      "provenance": "SYNTHETIC_DEMO",
      "linkedIssueCount": 1
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalRecords": 25,
    "totalPages": 2
  }
}
```

---

### 4.5. List Issues
`GET /api/issues`
- **Query Parameters:**
  - `page`, `limit`
  - `status`: `OPEN` | `IN_PROGRESS` | `RESOLVED` | `REOPENED`
  - `priority`: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`
  - `category`: category filter
  - `storeId`: store code or UUID
  - `ownerTeam`: team filter
  - `assignedTo`: assignee search substring
  - `search`: title or description substring
- **Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "4b6e8f10-5678-90ab-cdef-1234567890ab",
      "storeId": "a1b2c3d4-...",
      "storeCode": "STR-HYD-001",
      "storeName": "StoreGrid Banjara Hills",
      "title": "Severe HVAC Chiller Failure & Display Freezer Leakage",
      "description": "Store AC completely failed on afternoon of Oct 15",
      "category": "EQUIPMENT_FAILURE",
      "priority": "CRITICAL",
      "status": "IN_PROGRESS",
      "ownerTeam": "FACILITIES_MAINTENANCE",
      "assignedTo": "Ramesh HVAC Tech",
      "dueDate": "2026-10-17T15:00:00.000Z",
      "feedbackCount": 3,
      "createdAt": "2026-10-15T15:30:00.000Z",
      "updatedAt": "2026-10-15T16:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalRecords": 4,
    "totalPages": 1
  }
}
```

---

### 4.6. Get Issue Details & Audit History
`GET /api/issues/:id`
- **Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "4b6e8f10-5678-90ab-cdef-1234567890ab",
    "title": "Severe HVAC Chiller Failure & Display Freezer Leakage",
    "description": "Store AC completely failed on afternoon of Oct 15",
    "category": "EQUIPMENT_FAILURE",
    "priority": "CRITICAL",
    "status": "IN_PROGRESS",
    "ownerTeam": "FACILITIES_MAINTENANCE",
    "assignedTo": "Ramesh HVAC Tech",
    "dueDate": "2026-10-17T15:00:00.000Z",
    "resolutionNotes": null,
    "resolvedAt": null,
    "store": {
      "id": "a1b2c3d4-...",
      "code": "STR-HYD-001",
      "name": "StoreGrid Banjara Hills",
      "region": "Telangana",
      "city": "Hyderabad"
    },
    "linkedFeedback": [
      {
        "id": "fb-uuid-1",
        "text": "Severe AC breakdown at Banjara Hills store!",
        "sourceType": "CUSTOMER_REVIEW",
        "timestamp": "2026-10-15T14:10:00.000Z",
        "rating": 1,
        "language": "en",
        "relevanceScore": 1.0,
        "linkedAt": "2026-10-15T15:30:00.000Z"
      }
    ],
    "history": [
      {
        "id": "hist-1",
        "issueId": "4b6e8f10-...",
        "action": "CREATED",
        "changedBy": "Vinay (Lead)",
        "fieldChanged": "status",
        "previousValue": null,
        "newValue": "OPEN",
        "notes": "Issue created with category EQUIPMENT_FAILURE and priority CRITICAL",
        "createdAt": "2026-10-15T15:30:00.000Z"
      },
      {
        "id": "hist-2",
        "issueId": "4b6e8f10-...",
        "action": "ASSIGNMENT_CHANGED",
        "changedBy": "Vinay (Lead)",
        "fieldChanged": "assigned_to",
        "previousValue": null,
        "newValue": "Ramesh HVAC Tech",
        "notes": "Dispatched emergency HVAC technician",
        "createdAt": "2026-10-15T15:45:00.000Z"
      }
    ]
  }
}
```

---

### 4.7. Update Issue Assignment
`PATCH /api/issues/:id/assignment`
- **Request Body:**
```json
{
  "ownerTeam": "STORE_OPS",
  "assignedTo": "Pooja Shift Lead",
  "dueDate": "2026-10-18T18:00:00Z",
  "notes": "Reassigned for immediate shift follow-up",
  "changedBy": "Vinay (Lead)"
}
```
- **Response:** `200 OK` (returns updated issue with new audit entry).

---

### 4.8. Update Issue Status & Resolution
`PATCH /api/issues/:id/status`
- **Request Body:**
```json
{
  "status": "RESOLVED",
  "resolutionNotes": "Replaced thermal expansion valve on compressor 2. AC restored to 22°C.",
  "changedBy": "Vinay (Lead)"
}
```
- **Response:** `200 OK` (sets `resolvedAt: now()`, logs audit event, returns updated issue).

---

### 4.9. Get Issue Audit History
`GET /api/issues/:id/history`
- **Response:** `200 OK` (returns chronological array of all changes).

---

### 4.10. Dashboard Summary (Yashwant's Operations Dashboard)
`GET /api/dashboard/summary`
- **Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalFeedback": 25,
      "totalIssues": 4,
      "openIssues": 3,
      "criticalIssues": 1,
      "resolvedIssues": 1,
      "resolutionRatePercent": 25
    },
    "breakdown": {
      "byStatus": {
        "OPEN": 2,
        "IN_PROGRESS": 1,
        "RESOLVED": 1,
        "REOPENED": 0
      },
      "byCategory": {
        "STOCK_SHORTAGE": 1,
        "BILLING_DELAY": 1,
        "STAFF_BEHAVIOUR": 1,
        "PRODUCT_QUALITY": 0,
        "EQUIPMENT_FAILURE": 1,
        "NEEDS_REVIEW": 0
      },
      "byPriority": {
        "LOW": 0,
        "MEDIUM": 2,
        "HIGH": 1,
        "CRITICAL": 1
      },
      "bySource": {
        "CUSTOMER_REVIEW": 13,
        "STAFF_NOTE": 8,
        "CUSTOMER_SURVEY": 2,
        "KIOSK_FEEDBACK": 1,
        "CALL_TRANSCRIPT": 1
      },
      "byProvenance": {
        "SYNTHETIC_DEMO": 25
      }
    },
    "recentUrgentIssues": [
      {
        "id": "issue-uuid-1",
        "title": "Severe HVAC Chiller Failure & Display Freezer Leakage",
        "priority": "CRITICAL",
        "status": "IN_PROGRESS",
        "category": "EQUIPMENT_FAILURE",
        "ownerTeam": "FACILITIES_MAINTENANCE",
        "storeCode": "STR-HYD-001",
        "storeName": "StoreGrid Banjara Hills",
        "createdAt": "2026-10-15T15:30:00.000Z"
      }
    ],
    "activeSpikeAlerts": [
      {
        "storeCode": "STR-HYD-001",
        "storeName": "StoreGrid Banjara Hills",
        "date": "2026-10-15",
        "volume": 5,
        "dominantCategory": "EQUIPMENT_FAILURE",
        "severity": "CRITICAL"
      }
    ]
  }
}
```

---

### 4.11. Analytics Trends & Spike Detection (Sanjay's Analytics Engine)
`GET /api/analytics/trends?timeframe=30d`
- **Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "timeframe": "30d",
    "engineStatus": "BASELINE_ALGORITHMIC",
    "summary": {
      "totalTimelineDays": 5,
      "spikesDetectedCount": 1,
      "recurringPatternsCount": 3
    },
    "timeline": [
      {
        "date": "2026-10-15",
        "totalVolume": 6,
        "categories": {
          "EQUIPMENT_FAILURE": 3,
          "BILLING_DELAY": 3
        }
      }
    ],
    "detectedSpikes": [
      {
        "storeId": "store-uuid",
        "storeCode": "STR-HYD-001",
        "storeName": "StoreGrid Banjara Hills",
        "date": "2026-10-15",
        "volume": 5,
        "expectedDailyVolume": 1.8,
        "spikeRatio": 2.78,
        "dominantCategory": "EQUIPMENT_FAILURE",
        "severity": "CRITICAL"
      }
    ],
    "recurringPatterns": [
      {
        "storeCode": "STR-HYD-001",
        "storeName": "StoreGrid Banjara Hills",
        "category": "EQUIPMENT_FAILURE",
        "recurrenceCount": 4,
        "firstOccurrence": "2026-10-14T14:05:00Z",
        "latestOccurrence": "2026-10-15T15:00:00Z",
        "riskLevel": "HIGH"
      }
    ]
  }
}
```

---

## 5. Teammate Integration Contracts

### 5.1. Varshith — FastAPI NLP Classification Microservice
Varshith’s FastAPI Python service runs at `http://127.0.0.1:8000` (configurable via `NLP_SERVICE_URL`). It classifies customer feedback into one of the 7 supported categories and detects Telugu-English code-mixed phrases.

**Health Check Endpoint:**
- `GET /health`
- **Response (`200 OK`):**
  ```json
  {
    "status": "healthy",
    "service": "storegrid-nlp",
    "version": "1.0.0"
  }
  ```

**Classification Endpoint:**
- `POST /classify`
- **Input Payload (`FeedbackInput`):**
  ```json
  {
    "feedbackId": "7f8b9a2c-1234-5678-abcd-ef0123456789",
    "storeId": "STR-HYD-001",
    "text": "Billing chala slow ga undi counter daggara",
    "sourceType": "CUSTOMER_REVIEW",
    "language": "te-en",
    "createdAt": "2026-10-16T14:30:00Z"
  }
  ```

- **Output Response (`ClassificationResponse`):**
  ```json
  {
    "feedbackId": "7f8b9a2c-1234-5678-abcd-ef0123456789",
    "storeId": "STR-HYD-001",
    "originalText": "Billing chala slow ga undi counter daggara",
    "cleanedText": "billing chala slow ga undi counter daggara",
    "category": "BILLING_DELAY",
    "confidence": 0.90,
    "needsReview": false,
    "matchedTerms": [
      "billing chala slow ga undi"
    ]
  }
  ```

- **Conservative Fallback Rules:**
  - If conflicting operational signals collide (e.g. *"cashier was rude and milk was expired"*), the NLP service returns `category: "NEEDS_REVIEW"`, `confidence: 0.40`, `needsReview: true`, and aggregates matched terms from both departments.
  - If empty or unrecognized feedback is provided, returns `category: "NEEDS_REVIEW"`, `confidence: 0.0`, `needsReview: true`.
  - If the service is unreachable or times out (> 3000ms), Express safely records the feedback with `category: "NEEDS_REVIEW"` and `processingStatus: "PENDING"` without failing the request or fabricating classifications.

---

### 5.2. Sanjay — Priority Scoring & Trend Detection Module
Sanjay’s engine computes priority urgency scores and mathematical anomaly spikes.

**Priority Scoring Calculation Formula:**
$$\text{Priority Score} = w_1 \cdot \text{Severity} + w_2 \cdot \text{Spike Ratio} + w_3 \cdot \text{Recurrence Count} + w_4 \cdot (5 - \text{Rating})$$

**Expected Priority Output Schema:**
- Score $\ge 80 \implies$ `CRITICAL`
- Score $60 - 79 \implies$ `HIGH`
- Score $35 - 59 \implies$ `MEDIUM`
- Score $< 35 \implies$ `LOW`

---

### 5.3. Yashwant — React + Vite Frontend Dashboard
- **Base API URL:** `http://localhost:5000/api`
- **Key Views to Bind:**
  1. **Executive KPI Cards:** Bind to `GET /api/dashboard/summary` $\rightarrow$ `overview` object.
  2. **Active Spike Alert Banner:** Bind to `GET /api/dashboard/summary` $\rightarrow$ `activeSpikeAlerts`.
  3. **Issues Kanban / Table:** Bind to `GET /api/issues` with filter controls (`status`, `priority`, `category`).
  4. **Feedback Explorer:** Bind to `GET /api/feedback` with pagination controls.
  5. **CSV Upload Drawer:** `POST /api/feedback/import` sending `multipart/form-data` with `file`.
  6. **Issue Action Modal:**
     - Reassignment: `PATCH /api/issues/:id/assignment`
     - Status Change: `PATCH /api/issues/:id/status`
