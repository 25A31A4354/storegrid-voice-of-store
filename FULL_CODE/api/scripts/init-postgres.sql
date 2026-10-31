-- StoreGrid PostgreSQL Initial Migration DDL
-- Run this against any PostgreSQL database: psql -d storegrid -f init-postgres.sql

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE category_enum AS ENUM (
        'STOCK_SHORTAGE',
        'BILLING_DELAY',
        'STAFF_BEHAVIOUR',
        'PRODUCT_QUALITY',
        'EQUIPMENT_FAILURE',
        'OTHER',
        'NEEDS_REVIEW'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE priority_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE issue_status_enum AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REOPENED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE source_type_enum AS ENUM (
        'CUSTOMER_REVIEW',
        'STAFF_NOTE',
        'CALL_TRANSCRIPT',
        'CUSTOMER_SURVEY',
        'KIOSK_FEEDBACK',
        'WHATSAPP_CHAT',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE processing_status_enum AS ENUM ('PENDING', 'PROCESSED', 'IGNORED', 'ERROR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE provenance_enum AS ENUM ('SYNTHETIC_DEMO', 'OFFICIAL_DATASET', 'MANUAL_ENTRY', 'TEST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE owner_team_enum AS ENUM (
        'STORE_OPS',
        'INVENTORY',
        'BILLING_TECH',
        'FACILITIES_MAINTENANCE',
        'HR_TRAINING',
        'CUSTOMER_SERVICE',
        'QUALITY_ASSURANCE',
        'UNASSIGNED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_action_enum AS ENUM (
        'CREATED',
        'STATUS_CHANGED',
        'ASSIGNMENT_CHANGED',
        'PRIORITY_CHANGED',
        'FEEDBACK_LINKED',
        'FEEDBACK_UNLINKED',
        'NOTE_ADDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Stores Table
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

-- 3. Feedback Table
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

-- 4. Issues Table
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

-- 5. Issue-Feedback Junction Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS issue_feedback (
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    relevance_score NUMERIC(3, 2) DEFAULT 1.0,
    notes TEXT,
    linked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (issue_id, feedback_id)
);

-- 6. Issue History Table (Audit Log)
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

-- 7. Indexes for Query Performance
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

-- 8. System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Dataset Batches Table
CREATE TABLE IF NOT EXISTS dataset_batches (
    id VARCHAR(100) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    format VARCHAR(20) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    imported_records INTEGER NOT NULL DEFAULT 0,
    skipped_records INTEGER NOT NULL DEFAULT 0,
    duplicate_records INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    column_mapping TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    summary JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dataset_batches_created_at ON dataset_batches(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_batch_id ON feedback(batch_id);
