-- StoreGrid PostgreSQL Migration 0_init
-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Stores Table
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    region VARCHAR(100),
    city VARCHAR(100),
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Feedback Table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    text TEXT NOT NULL,
    source_type VARCHAR(50) NOT NULL DEFAULT 'CUSTOMER_REVIEW',
    timestamp TIMESTAMPTZ NOT NULL,
    rating SMALLINT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    language VARCHAR(20) DEFAULT 'en',
    detected_category VARCHAR(50) NOT NULL DEFAULT 'NEEDS_REVIEW',
    sentiment VARCHAR(20),
    processing_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    provenance VARCHAR(50) NOT NULL DEFAULT 'MANUAL_ENTRY',
    customer_identifier VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Issues Table
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    owner_team VARCHAR(50) NOT NULL DEFAULT 'UNASSIGNED',
    assigned_to VARCHAR(100),
    due_date TIMESTAMPTZ,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Issue-Feedback Junction Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS issue_feedback (
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    relevance_score NUMERIC(3, 2) DEFAULT 1.0,
    notes TEXT,
    linked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (issue_id, feedback_id)
);

-- 5. Issue History Table (Audit Log)
CREATE TABLE IF NOT EXISTS issue_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    changed_by VARCHAR(100) NOT NULL DEFAULT 'SYSTEM',
    field_changed VARCHAR(50),
    previous_value TEXT,
    new_value TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Indexes
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
