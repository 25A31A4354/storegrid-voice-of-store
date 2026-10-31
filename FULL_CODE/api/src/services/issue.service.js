const crypto = require('crypto');
const db = require('../db');
const storeService = require('./store.service');
const {
  CATEGORIES,
  PRIORITIES,
  ISSUE_STATUSES,
  OWNER_TEAMS,
  AUDIT_ACTIONS,
  VALID_CATEGORIES,
  VALID_PRIORITIES,
  VALID_ISSUE_STATUSES,
  VALID_OWNER_TEAMS,
} = require('../constants/enums');

/**
 * Format issue database row
 */
function formatIssue(row) {
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    storeCode: row.store_code || null,
    storeName: row.store_name || null,
    title: row.title,
    description: row.description || null,
    category: row.category,
    priority: row.priority,
    status: row.status,
    ownerTeam: row.owner_team,
    assignedTo: row.assigned_to || null,
    dueDate: row.due_date || null,
    resolutionNotes: row.resolution_notes || null,
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    feedbackCount: row.feedback_count !== undefined ? Number(row.feedback_count) : undefined,
  };
}

/**
 * Format audit history row
 */
function formatHistory(row) {
  if (!row) return null;
  return {
    id: row.id,
    issueId: row.issue_id,
    action: row.action,
    changedBy: row.changed_by,
    fieldChanged: row.field_changed || null,
    previousValue: row.previous_value || null,
    newValue: row.new_value || null,
    notes: row.notes || null,
    createdAt: row.created_at,
  };
}

/**
 * Record an audit event into issue_history
 */
async function recordAuditEvent({
  issueId,
  action,
  changedBy = 'SYSTEM',
  fieldChanged,
  previousValue,
  newValue,
  notes,
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const sql = `
    INSERT INTO issue_history (id, issue_id, action, changed_by, field_changed, previous_value, new_value, notes, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;

  const res = await db.query(sql, [
    id,
    issueId,
    action,
    changedBy,
    fieldChanged || null,
    previousValue || null,
    newValue || null,
    notes || null,
    now,
  ]);

  return formatHistory(res.rows[0]);
}

/**
 * Create a new issue with optional linked feedback
 */
async function createIssue({
  storeId,
  storeCode,
  title,
  description,
  category = CATEGORIES.NEEDS_REVIEW,
  priority = PRIORITIES.MEDIUM,
  status = ISSUE_STATUSES.OPEN,
  ownerTeam = OWNER_TEAMS.UNASSIGNED,
  assignedTo,
  dueDate,
  linkedFeedbackIds = [],
  createdBy = 'Vinay (Lead)',
}) {
  // Validate store
  let resolvedStoreId = storeId;
  if (!resolvedStoreId && storeCode) {
    const store = await storeService.getStoreByCode(storeCode);
    if (!store) throw new Error(`Store code '${storeCode}' not found.`);
    resolvedStoreId = store.id;
  } else if (resolvedStoreId) {
    const store = await storeService.getStoreById(resolvedStoreId);
    if (!store) {
      const byCode = await storeService.getStoreByCode(resolvedStoreId);
      if (byCode) {
        resolvedStoreId = byCode.id;
      } else {
        throw new Error(`Store ID '${resolvedStoreId}' not found.`);
      }
    }
  }

  if (!resolvedStoreId) {
    throw new Error('storeId or storeCode is required.');
  }

  if (!title || title.trim().length === 0) {
    throw new Error('Issue title is required.');
  }

  const safeCategory = VALID_CATEGORIES.includes(category) ? category : CATEGORIES.NEEDS_REVIEW;
  const safePriority = VALID_PRIORITIES.includes(priority) ? priority : PRIORITIES.MEDIUM;
  const safeStatus = VALID_ISSUE_STATUSES.includes(status) ? status : ISSUE_STATUSES.OPEN;
  const safeTeam = VALID_OWNER_TEAMS.includes(ownerTeam) ? ownerTeam : OWNER_TEAMS.UNASSIGNED;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const insertSql = `
    INSERT INTO issues (
      id, store_id, title, description, category, priority, status,
      owner_team, assigned_to, due_date, resolution_notes, resolved_at,
      created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *;
  `;

  await db.query(insertSql, [
    id,
    resolvedStoreId,
    title.trim(),
    description ? description.trim() : null,
    safeCategory,
    safePriority,
    safeStatus,
    safeTeam,
    assignedTo || null,
    dueDate ? new Date(dueDate).toISOString() : null,
    null,
    null,
    now,
    now,
  ]);

  // Link feedback IDs
  if (Array.isArray(linkedFeedbackIds) && linkedFeedbackIds.length > 0) {
    for (const feedbackId of linkedFeedbackIds) {
      await linkFeedbackToIssue(id, feedbackId, { relevanceScore: 1.0, changedBy: createdBy, skipAudit: true });
    }
  }

  // Audit event
  await recordAuditEvent({
    issueId: id,
    action: AUDIT_ACTIONS.CREATED,
    changedBy: createdBy,
    fieldChanged: 'status',
    previousValue: null,
    newValue: safeStatus,
    notes: `Issue created with category ${safeCategory} and priority ${safePriority}`,
  });

  return await getIssueById(id);
}

/**
 * Link a feedback record to an issue
 */
async function linkFeedbackToIssue(
  issueId,
  feedbackId,
  { relevanceScore = 1.0, notes = null, changedBy = 'SYSTEM', skipAudit = false } = {}
) {
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO issue_feedback (issue_id, feedback_id, relevance_score, notes, linked_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (issue_id, feedback_id) DO NOTHING;
  `;
  await db.query(sql, [issueId, feedbackId, relevanceScore, notes, now]);

  if (!skipAudit) {
    await recordAuditEvent({
      issueId,
      action: AUDIT_ACTIONS.FEEDBACK_LINKED,
      changedBy,
      fieldChanged: 'feedback_id',
      previousValue: null,
      newValue: feedbackId,
      notes: notes || 'Feedback linked to issue',
    });
  }
}

/**
 * Get issue by ID with linked feedback items and chronological history
 */
async function getIssueById(id) {
  const issueSql = `
    SELECT 
      i.*,
      s.code as store_code,
      s.name as store_name,
      s.region as store_region,
      s.city as store_city
    FROM issues i
    JOIN stores s ON i.store_id = s.id
    WHERE i.id = $1
    LIMIT 1;
  `;
  const issueRes = await db.query(issueSql, [id]);
  if (!issueRes.rows[0]) return null;

  const issue = formatIssue(issueRes.rows[0]);
  issue.store = {
    id: issueRes.rows[0].store_id,
    code: issueRes.rows[0].store_code,
    name: issueRes.rows[0].store_name,
    region: issueRes.rows[0].store_region,
    city: issueRes.rows[0].store_city,
  };

  // Linked feedback
  const feedbackSql = `
    SELECT 
      f.id,
      f.text,
      f.source_type,
      f.timestamp,
      f.rating,
      f.language,
      f.detected_category,
      f.provenance,
      ifb.relevance_score,
      ifb.linked_at,
      ifb.notes as link_notes
    FROM issue_feedback ifb
    JOIN feedback f ON ifb.feedback_id = f.id
    WHERE ifb.issue_id = $1
    ORDER BY ifb.linked_at DESC;
  `;
  const feedbackRes = await db.query(feedbackSql, [id]);
  issue.linkedFeedback = feedbackRes.rows.map((row) => ({
    id: row.id,
    text: row.text,
    sourceType: row.source_type,
    timestamp: row.timestamp,
    rating: row.rating !== null ? Number(row.rating) : null,
    language: row.language,
    detectedCategory: row.detected_category,
    provenance: row.provenance,
    relevanceScore: row.relevance_score !== null ? Number(row.relevance_score) : 1.0,
    linkedAt: row.linked_at,
    linkNotes: row.link_notes,
  }));
  issue.feedbackCount = issue.linkedFeedback.length;

  // Chronological Audit History
  const historySql = `
    SELECT * FROM issue_history
    WHERE issue_id = $1
    ORDER BY created_at ASC;
  `;
  const historyRes = await db.query(historySql, [id]);
  issue.history = historyRes.rows.map(formatHistory);

  return issue;
}

/**
 * List issues with filtering, pagination, and sorting
 */
async function listIssues(filters = {}, pagination = {}) {
  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const conditions = ['1=1'];
  const params = [];
  let paramIdx = 1;

  if (filters.status) {
    conditions.push(`i.status = $${paramIdx++}`);
    params.push(filters.status);
  }

  if (filters.priority) {
    conditions.push(`i.priority = $${paramIdx++}`);
    params.push(filters.priority);
  }

  if (filters.category) {
    conditions.push(`i.category = $${paramIdx++}`);
    params.push(filters.category);
  }

  if (filters.ownerTeam) {
    conditions.push(`i.owner_team = $${paramIdx++}`);
    params.push(filters.ownerTeam);
  }

  if (filters.assignedTo) {
    conditions.push(`LOWER(i.assigned_to) LIKE LOWER($${paramIdx++})`);
    params.push(`%${filters.assignedTo.trim()}%`);
  }

  if (filters.storeId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.storeId);
    if (isUuid) {
      conditions.push(`i.store_id = $${paramIdx++}`);
      params.push(filters.storeId);
    } else {
      conditions.push(`s.code = $${paramIdx++}`);
      params.push(filters.storeId.toUpperCase().trim());
    }
  }

  if (filters.search) {
    conditions.push(
      `(LOWER(i.title) LIKE LOWER($${paramIdx}) OR LOWER(COALESCE(i.description, '')) LIKE LOWER($${paramIdx}))`
    );
    params.push(`%${filters.search.trim()}%`);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  // Total count
  const countSql = `
    SELECT COUNT(*) as total
    FROM issues i
    JOIN stores s ON i.store_id = s.id
    WHERE ${whereClause};
  `;
  const countRes = await db.query(countSql, params);
  const totalRecords = parseInt(countRes.rows[0]?.total || 0, 10);

  // Sorting
  const allowedSortFields = {
    createdAt: 'i.created_at',
    updatedAt: 'i.updated_at',
    priority: 'i.priority',
    dueDate: 'i.due_date',
  };
  const sortCol = allowedSortFields[filters.sortBy] || 'i.created_at';
  const sortDir = filters.sortOrder && filters.sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Data query
  const dataSql = `
    SELECT 
      i.*,
      s.code as store_code,
      s.name as store_name,
      (SELECT COUNT(*) FROM issue_feedback ifb WHERE ifb.issue_id = i.id) as feedback_count
    FROM issues i
    JOIN stores s ON i.store_id = s.id
    WHERE ${whereClause}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT $${paramIdx++} OFFSET $${paramIdx++};
  `;

  params.push(limit, offset);
  const dataRes = await db.query(dataSql, params);

  return {
    data: dataRes.rows.map(formatIssue),
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit) || 1,
    },
  };
}

/**
 * Update issue assignment (team, assigned user, SLA due date) with audit history
 */
async function updateIssueAssignment(id, { ownerTeam, assignedTo, dueDate, notes, changedBy = 'Vinay (Lead)' }) {
  const current = await getIssueById(id);
  if (!current) {
    throw new Error(`Issue '${id}' not found.`);
  }

  const newTeam = ownerTeam !== undefined ? ownerTeam : current.ownerTeam;
  const newAssigned = assignedTo !== undefined ? assignedTo : current.assignedTo;
  const newDueDate = dueDate !== undefined ? (dueDate ? new Date(dueDate).toISOString() : null) : current.dueDate;

  if (newTeam && !VALID_OWNER_TEAMS.includes(newTeam)) {
    throw new Error(`Invalid owner team: ${newTeam}. Must be one of: ${VALID_OWNER_TEAMS.join(', ')}`);
  }

  const now = new Date().toISOString();
  const updateSql = `
    UPDATE issues
    SET owner_team = $1, assigned_to = $2, due_date = $3, updated_at = $4
    WHERE id = $5
    RETURNING *;
  `;

  await db.query(updateSql, [newTeam, newAssigned, newDueDate, now, id]);

  // Record audit events for changes
  if (current.ownerTeam !== newTeam) {
    await recordAuditEvent({
      issueId: id,
      action: AUDIT_ACTIONS.ASSIGNMENT_CHANGED,
      changedBy,
      fieldChanged: 'owner_team',
      previousValue: current.ownerTeam,
      newValue: newTeam,
      notes: notes || `Owner team updated to ${newTeam}`,
    });
  }

  if (current.assignedTo !== newAssigned) {
    await recordAuditEvent({
      issueId: id,
      action: AUDIT_ACTIONS.ASSIGNMENT_CHANGED,
      changedBy,
      fieldChanged: 'assigned_to',
      previousValue: current.assignedTo,
      newValue: newAssigned,
      notes: notes || `Assignee updated to ${newAssigned || 'Unassigned'}`,
    });
  }

  if (current.dueDate !== newDueDate) {
    await recordAuditEvent({
      issueId: id,
      action: AUDIT_ACTIONS.ASSIGNMENT_CHANGED,
      changedBy,
      fieldChanged: 'due_date',
      previousValue: current.dueDate,
      newValue: newDueDate,
      notes: notes || `Due date updated`,
    });
  }

  return await getIssueById(id);
}

/**
 * Update issue status with resolution notes and audit history
 */
async function updateIssueStatus(id, { status, resolutionNotes, changedBy = 'Vinay (Lead)' }) {
  const current = await getIssueById(id);
  if (!current) {
    throw new Error(`Issue '${id}' not found.`);
  }

  if (!status || !VALID_ISSUE_STATUSES.includes(status)) {
    throw new Error(`Invalid status '${status}'. Must be one of: ${VALID_ISSUE_STATUSES.join(', ')}`);
  }

  const now = new Date().toISOString();
  let resolvedAt = current.resolvedAt;
  let finalResolutionNotes = current.resolutionNotes;

  if (status === ISSUE_STATUSES.RESOLVED) {
    resolvedAt = now;
    finalResolutionNotes = resolutionNotes || current.resolutionNotes || 'Resolved by operations team.';
  } else if (status === ISSUE_STATUSES.REOPENED) {
    resolvedAt = null;
    finalResolutionNotes = resolutionNotes ? `Reopened: ${resolutionNotes}` : current.resolutionNotes;
  } else if (resolutionNotes) {
    finalResolutionNotes = resolutionNotes;
  }

  const updateSql = `
    UPDATE issues
    SET status = $1, resolution_notes = $2, resolved_at = $3, updated_at = $4
    WHERE id = $5
    RETURNING *;
  `;

  await db.query(updateSql, [status, finalResolutionNotes, resolvedAt, now, id]);

  // Record audit history
  await recordAuditEvent({
    issueId: id,
    action: AUDIT_ACTIONS.STATUS_CHANGED,
    changedBy,
    fieldChanged: 'status',
    previousValue: current.status,
    newValue: status,
    notes: resolutionNotes || `Status changed from ${current.status} to ${status}`,
  });

  return await getIssueById(id);
}

/**
 * Get audit history for an issue
 */
async function getIssueHistory(id) {
  const issue = await getIssueById(id);
  if (!issue) {
    throw new Error(`Issue '${id}' not found.`);
  }

  const sql = `
    SELECT * FROM issue_history
    WHERE issue_id = $1
    ORDER BY created_at ASC;
  `;
  const res = await db.query(sql, [id]);
  return res.rows.map(formatHistory);
}

module.exports = {
  createIssue,
  getIssueById,
  listIssues,
  updateIssueAssignment,
  updateIssueStatus,
  getIssueHistory,
  linkFeedbackToIssue,
  recordAuditEvent,
  formatIssue,
  formatHistory,
};
