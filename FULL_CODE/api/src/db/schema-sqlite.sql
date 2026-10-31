-- StoreGrid SQLite Development Fallback Schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    region TEXT,
    city TEXT,
    address TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    text TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'CUSTOMER_REVIEW',
    timestamp TEXT NOT NULL,
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    language TEXT DEFAULT 'en',
    detected_category TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    sentiment TEXT,
    processing_status TEXT NOT NULL DEFAULT 'PENDING',
    provenance TEXT NOT NULL DEFAULT 'MANUAL_ENTRY',
    customer_identifier TEXT,
    metadata TEXT,
    batch_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'MEDIUM',
    status TEXT NOT NULL DEFAULT 'OPEN',
    owner_team TEXT NOT NULL DEFAULT 'UNASSIGNED',
    assigned_to TEXT,
    due_date TEXT,
    resolution_notes TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_feedback (
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    relevance_score REAL DEFAULT 1.0,
    notes TEXT,
    linked_at TEXT NOT NULL,
    PRIMARY KEY (issue_id, feedback_id)
);

CREATE TABLE IF NOT EXISTS issue_history (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    changed_by TEXT NOT NULL DEFAULT 'SYSTEM',
    field_changed TEXT,
    previous_value TEXT,
    new_value TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_store_id ON feedback(store_id);
CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON feedback(timestamp);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON feedback(detected_category);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(processing_status);
CREATE INDEX IF NOT EXISTS idx_feedback_provenance ON feedback(provenance);

CREATE INDEX IF NOT EXISTS idx_issues_store_id ON issues(store_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority);
CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);
CREATE INDEX IF NOT EXISTS idx_issues_owner_team ON issues(owner_team);

CREATE INDEX IF NOT EXISTS idx_issue_history_issue_id ON issue_history(issue_id);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_batches (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    format TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    imported_records INTEGER NOT NULL DEFAULT 0,
    skipped_records INTEGER NOT NULL DEFAULT 0,
    duplicate_records INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    column_mapping TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    summary TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dataset_batches_created_at ON dataset_batches(created_at);
