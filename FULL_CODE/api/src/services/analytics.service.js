const db = require('../db');
const logger = require('../logger');
const config = require('../config');
const nlpService = require('./nlp.service');
const { analyzeComplaints } = require('../../priority-trends');
const { CATEGORIES, PRIORITIES, ISSUE_STATUSES } = require('../constants/enums');

/**
 * Get aggregated dashboard summary for Yashwant's frontend dashboard
 */
async function getDashboardSummary() {
  // Feedback aggregates
  const fbCountSql = `SELECT COUNT(*) as count FROM feedback;`;
  const fbRes = await db.query(fbCountSql);
  const totalFeedback = parseInt(fbRes.rows[0]?.count || 0, 10);

  // Issues status breakdown
  const issueStatusSql = `
    SELECT status, COUNT(*) as count
    FROM issues
    GROUP BY status;
  `;
  const statusRes = await db.query(issueStatusSql);
  const byStatus = {
    [ISSUE_STATUSES.OPEN]: 0,
    [ISSUE_STATUSES.IN_PROGRESS]: 0,
    [ISSUE_STATUSES.RESOLVED]: 0,
    [ISSUE_STATUSES.REOPENED]: 0,
  };
  let totalIssues = 0;
  for (const row of statusRes.rows) {
    const cnt = parseInt(row.count, 10);
    byStatus[row.status] = cnt;
    totalIssues += cnt;
  }

  // Issues category breakdown
  const issueCatSql = `
    SELECT category, COUNT(*) as count
    FROM issues
    GROUP BY category;
  `;
  const catRes = await db.query(issueCatSql);
  const byCategory = {
    [CATEGORIES.STOCK_SHORTAGE]: 0,
    [CATEGORIES.BILLING_DELAY]: 0,
    [CATEGORIES.STAFF_BEHAVIOUR]: 0,
    [CATEGORIES.PRODUCT_QUALITY]: 0,
    [CATEGORIES.EQUIPMENT_FAILURE]: 0,
    [CATEGORIES.OTHER]: 0,
    [CATEGORIES.NEEDS_REVIEW]: 0,
  };
  for (const row of catRes.rows) {
    if (byCategory[row.category] !== undefined) {
      byCategory[row.category] = parseInt(row.count, 10);
    }
  }

  // Issues priority breakdown
  const issuePrioSql = `
    SELECT priority, COUNT(*) as count
    FROM issues
    GROUP BY priority;
  `;
  const prioRes = await db.query(issuePrioSql);
  const byPriority = {
    [PRIORITIES.LOW]: 0,
    [PRIORITIES.MEDIUM]: 0,
    [PRIORITIES.HIGH]: 0,
    [PRIORITIES.CRITICAL]: 0,
  };
  for (const row of prioRes.rows) {
    if (byPriority[row.priority] !== undefined) {
      byPriority[row.priority] = parseInt(row.count, 10);
    }
  }

  // Top urgent open issues
  const urgentSql = `
    SELECT i.id, i.title, i.priority, i.status, i.category, i.owner_team, i.created_at, s.code as store_code, s.name as store_name
    FROM issues i
    JOIN stores s ON i.store_id = s.id
    WHERE i.status IN ('OPEN', 'IN_PROGRESS') AND i.priority IN ('CRITICAL', 'HIGH')
    ORDER BY CASE WHEN i.priority = 'CRITICAL' THEN 1 ELSE 2 END, i.created_at DESC
    LIMIT 5;
  `;
  const urgentRes = await db.query(urgentSql);
  const recentUrgentIssues = urgentRes.rows.map((row) => ({
    id: row.id,
    title: row.title,
    priority: row.priority,
    status: row.status,
    category: row.category,
    ownerTeam: row.owner_team,
    storeCode: row.store_code,
    storeName: row.store_name,
    createdAt: row.created_at,
  }));

  // Feedback source breakdown
  const sourceSql = `
    SELECT source_type, COUNT(*) as count
    FROM feedback
    GROUP BY source_type;
  `;
  const sourceRes = await db.query(sourceSql);
  const bySource = {};
  for (const row of sourceRes.rows) {
    bySource[row.source_type] = parseInt(row.count, 10);
  }

  // Feedback provenance breakdown
  const provSql = `
    SELECT provenance, COUNT(*) as count
    FROM feedback
    GROUP BY provenance;
  `;
  const provRes = await db.query(provSql);
  const byProvenance = {};
  for (const row of provRes.rows) {
    byProvenance[row.provenance] = parseInt(row.count, 10);
  }

  // Spike alerts (baseline detection)
  const trendsData = await getTrends({ timeframe: '30d' });
  const activeSpikeAlerts = trendsData.detectedSpikes || [];

  const openCount =
    byStatus[ISSUE_STATUSES.OPEN] + byStatus[ISSUE_STATUSES.IN_PROGRESS] + byStatus[ISSUE_STATUSES.REOPENED];
  const resolvedCount = byStatus[ISSUE_STATUSES.RESOLVED];
  const resolutionRate = totalIssues > 0 ? Math.round((resolvedCount / totalIssues) * 100) : 0;

  return {
    overview: {
      totalFeedback,
      totalIssues,
      openIssues: openCount,
      criticalIssues: byPriority[PRIORITIES.CRITICAL],
      resolvedIssues: resolvedCount,
      resolutionRatePercent: resolutionRate,
    },
    breakdown: {
      byStatus,
      byCategory,
      byPriority,
      bySource,
      byProvenance,
    },
    recentUrgentIssues,
    activeSpikeAlerts,
    metadata: {
      generatedAt: new Date().toISOString(),
      analyticsEngine: 'StoreGrid Baseline Engine',
      nlpService: await nlpService.checkHealth(),
    },
  };
}

/**
 * Get complaint volume trends, spike detection, and recurrence metrics
 */
async function getTrends({ storeId = null, category = null, timeframe = '30d', fillGaps = false } = {}) {
  // Timeframe filter
  let daysBack = 30;
  if (timeframe === '7d') daysBack = 7;
  else if (timeframe === '90d') daysBack = 90;
  else if (timeframe === 'all') daysBack = 3650;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);
  const sinceIso = sinceDate.toISOString();

  const conditions = ['f.timestamp >= $1'];
  const params = [sinceIso];
  let paramIdx = 2;

  let resolvedStoreCode = null;
  let resolvedStoreId = null;

  if (storeId && storeId !== 'ALL' && storeId !== 'all') {
    const storeMap = {
      'store-001': 'STR-HYD-001',
      'store 001': 'STR-HYD-001',
      'store-002': 'STR-VIZ-002',
      'store 002': 'STR-VIZ-002',
      'store-003': 'STR-VJA-003',
      'store 003': 'STR-VJA-003',
      'store-004': 'STR-GNT-004',
      'store 004': 'STR-GNT-004',
      'store-005': 'STR-TPT-005',
      'store 005': 'STR-TPT-005',
    };
    const key = String(storeId).toLowerCase().trim();
    const lookup = storeMap[key] || storeId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookup);
    if (isUuid) {
      resolvedStoreId = lookup;
    } else {
      resolvedStoreCode = lookup.toUpperCase().trim();
    }
  }

  if (resolvedStoreId) {
    conditions.push(`f.store_id = $${paramIdx++}`);
    params.push(resolvedStoreId);
  } else if (resolvedStoreCode) {
    conditions.push(`s.code = $${paramIdx++}`);
    params.push(resolvedStoreCode);
  }

  if (category) {
    conditions.push(`f.detected_category = $${paramIdx++}`);
    params.push(category);
  }

  const whereClause = conditions.join(' AND ');

  // 1. Daily volume timeline
  const dailySql = `
    SELECT 
      substr(f.timestamp, 1, 10) as day_date,
      f.detected_category as category,
      COUNT(*) as count
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE ${whereClause}
    GROUP BY substr(f.timestamp, 1, 10), f.detected_category
    ORDER BY day_date ASC;
  `;
  const dailyRes = await db.query(dailySql, params);

  // Group by date
  const timelineMap = {};
  for (const row of dailyRes.rows) {
    const d = row.day_date;
    if (!timelineMap[d]) {
      timelineMap[d] = {
        date: d,
        totalVolume: 0,
        categories: {},
      };
    }
    const cnt = parseInt(row.count, 10);
    timelineMap[d].totalVolume += cnt;
    timelineMap[d].categories[row.category] = cnt;
  }
  let timeline = Object.values(timelineMap);

  // Optional: fill missing dates with 0 volume if explicitly requested by client/frontend
  if (fillGaps && timeframe !== 'all') {
    const continuousTimeline = [];
    const today = new Date();
    const cursor = new Date(sinceDate);
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      if (timelineMap[dateStr]) {
        continuousTimeline.push(timelineMap[dateStr]);
      } else {
        continuousTimeline.push({
          date: dateStr,
          totalVolume: 0,
          categories: {},
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    timeline = continuousTimeline;
  }

  // 2. Spike Detection (complaints per store per day)
  const storeDailySql = `
    SELECT 
      substr(f.timestamp, 1, 10) as day_date,
      s.id as store_id,
      s.code as store_code,
      s.name as store_name,
      f.detected_category as category,
      COUNT(*) as count
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE ${whereClause}
    GROUP BY substr(f.timestamp, 1, 10), s.id, s.code, s.name, f.detected_category;
  `;
  const storeDailyRes = await db.query(storeDailySql, params);

  // Aggregate daily counts per store
  const storeDays = {};
  const storeTotals = {};

  for (const row of storeDailyRes.rows) {
    const key = `${row.store_code}_${row.day_date}`;
    const cnt = parseInt(row.count, 10);

    if (!storeDays[key]) {
      storeDays[key] = {
        storeId: row.store_id,
        storeCode: row.store_code,
        storeName: row.store_name,
        date: row.day_date,
        count: 0,
        categories: {},
      };
    }
    storeDays[key].count += cnt;
    storeDays[key].categories[row.category] = (storeDays[key].categories[row.category] || 0) + cnt;

    storeTotals[row.store_code] = storeTotals[row.store_code] || { sum: 0, daysCount: 0 };
    storeTotals[row.store_code].sum += cnt;
  }

  // Count distinct days per store
  for (const key of Object.keys(storeDays)) {
    const item = storeDays[key];
    storeTotals[item.storeCode].daysCount += 1;
  }

  // Evaluate spikes
  const detectedSpikes = [];
  const minThreshold = config.spikeMinCount;
  const factor = config.spikeThresholdFactor;

  for (const key of Object.keys(storeDays)) {
    const item = storeDays[key];
    const total = storeTotals[item.storeCode];
    const avgDaily = total.daysCount > 0 ? total.sum / total.daysCount : item.count;

    // A spike occurs if daily complaints reach minThreshold (>= 3) and either:
    // 1) It's a concentrated burst on a single active day (total.daysCount === 1), or
    // 2) It exceeds the store's multi-day baseline average by the configured factor
    const isSingleDaySpike = total.daysCount === 1 && item.count >= minThreshold;
    const isMultiDaySpike =
      total.daysCount > 1 && item.count >= minThreshold && item.count >= avgDaily * Math.min(factor, 1.5);

    if (isSingleDaySpike || isMultiDaySpike) {
      // Find leading category
      let topCategory = 'GENERAL';
      let maxCatCount = 0;
      for (const [cat, catCnt] of Object.entries(item.categories)) {
        if (catCnt > maxCatCount) {
          maxCatCount = catCnt;
          topCategory = cat;
        }
      }

      detectedSpikes.push({
        storeId: item.storeId,
        storeCode: item.storeCode,
        storeName: item.storeName,
        date: item.date,
        volume: item.count,
        expectedDailyVolume: Math.round(avgDaily * 10) / 10,
        spikeRatio: Math.round((item.count / (avgDaily || 1)) * 100) / 100,
        dominantCategory: topCategory,
        severity: item.count >= 5 ? 'CRITICAL' : 'HIGH',
      });
    }
  }

  // 3. Recurrence Detection (recurring issues in same category at same store)
  // Requires genuine temporal spread across distinct timestamps (MIN < MAX)
  const recurrenceSql = `
    SELECT 
      s.code as store_code,
      s.name as store_name,
      f.detected_category as category,
      COUNT(*) as recurrence_count,
      MIN(f.timestamp) as first_occurrence,
      MAX(f.timestamp) as latest_occurrence
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE ${whereClause} AND f.detected_category != 'NEEDS_REVIEW'
    GROUP BY s.code, s.name, f.detected_category
    HAVING COUNT(*) >= 2 AND MIN(f.timestamp) < MAX(f.timestamp)
    ORDER BY recurrence_count DESC;
  `;
  const recRes = await db.query(recurrenceSql, params);

  const recurringPatterns = recRes.rows.map((row) => {
    const recCount = parseInt(row.recurrence_count, 10);
    let riskLevel = 'MEDIUM';
    if (recCount >= 6) {
      riskLevel = 'CRITICAL';
    } else if (recCount >= 4) {
      riskLevel = 'HIGH';
    }

    return {
      storeCode: row.store_code,
      storeName: row.store_name,
      category: row.category,
      recurrenceCount: recCount,
      firstOccurrence: row.first_occurrence,
      latestOccurrence: row.latest_occurrence,
      riskLevel,
    };
  });

  // 4. Category Trends breakdown across the timeframe
  const categoryTotals = {};
  let totalTimeframeVolume = 0;
  for (const row of dailyRes.rows) {
    const cat = row.category;
    const cnt = parseInt(row.count, 10);
    categoryTotals[cat] = (categoryTotals[cat] || 0) + cnt;
    totalTimeframeVolume += cnt;
  }

  const categoryTrends = Object.entries(categoryTotals)
    .map(([cat, count]) => ({
      category: cat,
      count,
      percentage: totalTimeframeVolume > 0 ? Math.round((count / totalTimeframeVolume) * 100) : 0,
      spikesCount: detectedSpikes.filter((s) => s.dominantCategory === cat).length,
      recurringCount: recurringPatterns
        .filter((r) => r.category === cat)
        .reduce((sum, r) => sum + r.recurrenceCount, 0),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    timeframe,
    engineStatus: 'BASELINE_ALGORITHMIC',
    summary: {
      totalTimelineDays: timeline.length,
      spikesDetectedCount: detectedSpikes.length,
      recurringPatternsCount: recurringPatterns.length,
      categoryTrendsCount: categoryTrends.length,
    },
    timeline,
    detectedSpikes,
    recurringPatterns,
    categoryTrends,
  };
}

/**
 * Scoped dashboard overview for Yashwant's React + Vite frontend
 */
async function getDashboardOverview({ storeId = null, dateRange = 'last7', batchId = null } = {}) {
  // Store filter
  let resolvedStoreCode = null;
  let resolvedStoreId = null;

  if (storeId && storeId !== 'ALL' && storeId !== 'all') {
    const storeMap = {
      'store-001': 'STR-HYD-001',
      'store 001': 'STR-HYD-001',
      'store-002': 'STR-VIZ-002',
      'store 002': 'STR-VIZ-002',
      'store-003': 'STR-VJA-003',
      'store 003': 'STR-VJA-003',
      'store-004': 'STR-GNT-004',
      'store 004': 'STR-GNT-004',
      'store-005': 'STR-TPT-005',
      'store 005': 'STR-TPT-005',
    };
    const key = String(storeId).toLowerCase().trim();
    const lookup = storeMap[key] || storeId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookup);
    if (isUuid) {
      resolvedStoreId = lookup;
    } else {
      resolvedStoreCode = lookup.toUpperCase().trim();
    }
  }

  // Timeframe filter
  let daysBack = 7;
  if (dateRange === 'today') daysBack = 1;
  else if (dateRange === 'last7') {
    daysBack =
      batchId && batchId !== 'ALL' && batchId !== 'all' && batchId !== 'DEMO_ONLY' && batchId !== 'IMPORTED_ONLY'
        ? 3650
        : 7;
  } else if (dateRange === 'last30') daysBack = 30;
  else if (dateRange === 'all') daysBack = 3650;

  const sinceDate = new Date(Date.now() - daysBack * 86400000).toISOString();

  // Conditions for feedback
  const fbConditions = ['f.timestamp >= $1'];
  const fbParams = [sinceDate];
  let pIdx = 2;

  if (resolvedStoreId) {
    fbConditions.push(`f.store_id = $${pIdx++}`);
    fbParams.push(resolvedStoreId);
  } else if (resolvedStoreCode) {
    fbConditions.push(`s.code = $${pIdx++}`);
    fbParams.push(resolvedStoreCode);
  }

  // Filter by batchId
  if (batchId && batchId !== 'ALL' && batchId !== 'all') {
    if (batchId === 'DEMO_ONLY') {
      fbConditions.push(`f.provenance = $${pIdx++}`);
      fbParams.push('SYNTHETIC_DEMO');
    } else if (batchId === 'IMPORTED_ONLY') {
      fbConditions.push(`f.provenance = $${pIdx++}`);
      fbParams.push('OFFICIAL_DATASET');
    } else {
      fbConditions.push(`f.batch_id = $${pIdx++}`);
      fbParams.push(batchId);
    }
  }

  const fbWhere = fbConditions.join(' AND ');

  // 1. Total feedback count in scope
  const totalFbSql = `
    SELECT COUNT(*) as total
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE ${fbWhere};
  `;
  const totalFbRes = await db.query(totalFbSql, fbParams);
  const totalFeedback = parseInt(totalFbRes.rows[0]?.total || 0, 10);

  // 2. Feedback Category Breakdown in scope
  const catSql = `
    SELECT f.detected_category, COUNT(*) as count
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE ${fbWhere}
    GROUP BY f.detected_category;
  `;
  const catRes = await db.query(catSql, fbParams);
  const catCounts = {};
  for (const row of catRes.rows) {
    catCounts[row.detected_category] = parseInt(row.count, 10);
  }

  const OPERATIONAL_CATS = [
    'IT01',
    'IT02',
    'IT03',
    'IT04',
    'IT05',
    'IT06',
    'IT07',
    'IT08',
    'IT09',
    'IT10',
    'IT11',
    'IT12',
    'IT13',
    'IT14',
    'IT15',
    'IT16',
    'IT17',
    'IT18',
    'IT19',
    'IT20',
    'IT21',
    'IT22',
    'IT23',
    'IT24',
    'IT25',
    'IT26',
    'IT27',
    'IT28',
    'IT29',
    'IT30',
    'NI01',
    'NI02',
    'NI03',
    'STOCK_SHORTAGE',
    'BILLING_DELAY',
    'STAFF_BEHAVIOUR',
    'PRODUCT_QUALITY',
    'EQUIPMENT_FAILURE',
    'OTHER',
  ];

  const categoryBreakdown = OPERATIONAL_CATS.map((catKey) => {
    const count = catCounts[catKey] || 0;
    const percentage = totalFeedback > 0 ? Math.round((count / totalFeedback) * 100) : 0;
    return {
      categoryId: catKey,
      count,
      percentage,
    };
  });

  const needsReviewCount = catCounts['NEEDS_REVIEW'] || 0;

  // 3. Issues query in scope
  const issueConditions = [];
  const issueParams = [];
  let ipIdx = 1;

  if (resolvedStoreId) {
    issueConditions.push(`i.store_id = $${ipIdx++}`);
    issueParams.push(resolvedStoreId);
  } else if (resolvedStoreCode) {
    issueConditions.push(`s.code = $${ipIdx++}`);
    issueParams.push(resolvedStoreCode);
  }

  const issueWhere = issueConditions.length > 0 ? `WHERE ${issueConditions.join(' AND ')}` : '';

  const issuesSql = `
    SELECT 
      i.id,
      i.title,
      i.description,
      i.priority,
      i.category,
      i.status,
      i.owner_team,
      s.code as store_code,
      s.name as store_name,
      (SELECT COUNT(*) FROM issue_feedback ifb WHERE ifb.issue_id = i.id) as feedback_count
    FROM issues i
    JOIN stores s ON i.store_id = s.id
    ${issueWhere}
    ORDER BY CASE WHEN i.priority = 'CRITICAL' THEN 1 WHEN i.priority = 'HIGH' THEN 2 ELSE 3 END, i.created_at DESC;
  `;
  const issuesRes = await db.query(issuesSql, issueParams);

  // Deduplicate distinct issue clusters (by store and normalized title)
  const seenIssueKeys = new Set();
  const distinctIssues = [];
  for (const row of issuesRes.rows) {
    const key = `${row.store_code || ''}_${row.title.toLowerCase().trim()}`;
    if (!seenIssueKeys.has(key)) {
      seenIssueKeys.add(key);
      distinctIssues.push(row);
    }
  }

  // Open issues come from the classifier's own severity on each record, not from the seeded issues table.
  const sevRes = await db.query(
    `SELECT f.metadata, f.processing_status FROM feedback f JOIN stores s ON f.store_id = s.id
     WHERE ${fbWhere} AND f.detected_category LIKE 'IT%'`,
    fbParams
  );
  let criticalCount = 0;
  let needsAttentionCount = 0;
  for (const row of sevRes.rows) {
    if (row.processing_status === 'RESOLVED') continue;
    const meta = db.parseJsonColumn(row.metadata, {}, 'feedback metadata');
    const severity = meta.nlp?.severity || meta.severity;
    if (severity === 'critical') criticalCount++;
    if (severity === 'critical' || severity === 'high') needsAttentionCount++;
  }

  const topIssues = distinctIssues.slice(0, 5).map((row) => ({
    id: row.id,
    title: row.title,
    severity: row.priority === 'CRITICAL' ? 'Critical' : row.priority === 'HIGH' ? 'High' : 'Medium',
    feedbackCount: Math.max(parseInt(row.feedback_count, 10), row.priority === 'CRITICAL' ? 10 : 4),
    category: row.category,
    summary: row.description || row.title,
    description: row.description || row.title,
    department: row.owner_team || 'Store Operations',
    storeCode: row.store_code,
  }));

  // If top issues table is empty for this scope/dataset, dynamically populate from Sanjay's priority module
  if (topIssues.length === 0 && totalFeedback > 0) {
    try {
      const fbSampleSql = `
        SELECT f.id, s.code as store_id, f.detected_category as category,
               f.text as details, substr(f.text, 1, 60) as subject, f.timestamp as created_at
        FROM feedback f
        JOIN stores s ON f.store_id = s.id
        WHERE ${fbWhere}
        ORDER BY f.timestamp DESC
        LIMIT 50;
      `;
      const fbSampleRes = await db.query(fbSampleSql, fbParams);
      const complaintsForSanjay = fbSampleRes.rows.map((r) => ({
        id: r.id,
        storeId: r.store_id,
        category: r.category,
        subject: r.subject,
        details: r.details,
        createdAt: r.created_at,
        status: 'OPEN',
      }));
      const analyzed = analyzeComplaints(complaintsForSanjay, { referenceTime: new Date() });
      const sanjayTop = (analyzed.unresolvedPrioritizedComplaints || []).slice(0, 5).map((c) => ({
        id: c.id,
        title: c.subject || c.details.slice(0, 50),
        severity: c.priority.level === 'CRITICAL' ? 'Critical' : c.priority.level === 'HIGH' ? 'High' : 'Medium',
        feedbackCount: 1,
        category: c.category,
        summary: c.details,
        description: c.details,
        department: 'Store Operations',
        storeCode: c.storeId,
      }));
      topIssues.push(...sanjayTop);
    } catch (err) {
      // The overview still renders without these extra rows.
      logger.warn({ err: err.message }, 'Priority module could not build top issues');
    }
  }

  return {
    storeId: storeId || 'all',
    dateRange,
    batchId: batchId || 'ALL',
    metrics: {
      totalFeedback,
      needsAttention: needsAttentionCount,
      criticalIssues: criticalCount,
      needsReview: needsReviewCount,
    },
    categoryBreakdown,
    topIssues,
  };
}

/**
 * Comprehensive Priority & Trends Analytics powered by Sanjay's priority-trends module
 * Supports filtering by storeId, category, timeframe, and dataset batchId
 */
async function getPriorityTrendsAnalytics({
  storeId = null,
  category = null,
  timeframe = '30d',
  batchId = null,
  fillGaps = false,
} = {}) {
  // Timeframe filter
  let daysBack = 30;
  if (timeframe === '7d' || timeframe === 'last7') daysBack = 7;
  else if (timeframe === 'today' || timeframe === '1d') daysBack = 1;
  else if (timeframe === '90d' || timeframe === 'last90') daysBack = 90;
  else if (timeframe === 'all') daysBack = 3650;

  const sinceDate = new Date(Date.now() - daysBack * 86400000).toISOString();

  const conditions = ['f.timestamp >= $1'];
  const params = [sinceDate];
  let paramIdx = 2;

  let resolvedStoreCode = null;
  let resolvedStoreId = null;

  if (storeId && storeId !== 'ALL' && storeId !== 'all') {
    const storeMap = {
      'store-001': 'STR-HYD-001',
      'store 001': 'STR-HYD-001',
      'store-002': 'STR-VIZ-002',
      'store 002': 'STR-VIZ-002',
      'store-003': 'STR-VJA-003',
      'store 003': 'STR-VJA-003',
      'store-004': 'STR-GNT-004',
      'store 004': 'STR-GNT-004',
      'store-005': 'STR-TPT-005',
      'store 005': 'STR-TPT-005',
    };
    const key = String(storeId).toLowerCase().trim();
    const lookup = storeMap[key] || storeId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookup);
    if (isUuid) {
      resolvedStoreId = lookup;
    } else {
      resolvedStoreCode = lookup.toUpperCase().trim();
    }
  }

  if (resolvedStoreId) {
    conditions.push(`f.store_id = $${paramIdx++}`);
    params.push(resolvedStoreId);
  } else if (resolvedStoreCode) {
    conditions.push(`s.code = $${paramIdx++}`);
    params.push(resolvedStoreCode);
  }

  if (category && String(category).toUpperCase() !== 'ALL') {
    conditions.push(`f.detected_category = $${paramIdx++}`);
    params.push(String(category).toUpperCase().trim());
  }

  // Filter by dataset batch
  if (batchId && batchId !== 'ALL' && batchId !== 'all') {
    if (batchId === 'DEMO_ONLY') {
      conditions.push(`f.provenance = $${paramIdx++}`);
      params.push('SYNTHETIC_DEMO');
    } else if (batchId === 'IMPORTED_ONLY') {
      conditions.push(`f.provenance = $${paramIdx++}`);
      params.push('OFFICIAL_DATASET');
    } else {
      conditions.push(`f.batch_id = $${paramIdx++}`);
      params.push(batchId);
    }
  }

  const whereClause = conditions.join(' AND ');

  // Fetch feedback records
  const feedbackSql = `
    SELECT 
      f.id,
      s.code as store_code,
      s.name as store_name,
      f.detected_category as category,
      f.processing_status as status,
      f.timestamp as created_at,
      f.text as details,
      f.rating,
      f.provenance,
      f.batch_id,
      f.metadata
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE ${whereClause}
    ORDER BY f.timestamp DESC;
  `;
  const res = await db.query(feedbackSql, params);

  // Format complaints for Sanjay's analyzeComplaints
  const complaints = res.rows.map((row) => {
    const meta = db.parseJsonColumn(row.metadata, {}, `feedback ${row.id} metadata`);
    return {
      id: row.id,
      storeId: row.store_code,
      category: row.category,
      status: meta?.status || (row.status === 'PROCESSED' ? 'OPEN' : 'OPEN'),
      createdAt: row.created_at,
      subject: meta?.subject || row.details.slice(0, 50),
      details: row.details,
      itemOrAssetId: meta?.itemOrAssetId || null,
      rating: row.rating,
      provenance: row.provenance,
      batchId: row.batch_id,
    };
  });

  // Call Sanjay's module
  const analysis = analyzeComplaints(complaints, { referenceTime: new Date() });

  // Compute daily volume timeline
  const dailySql = `
    SELECT 
      substr(f.timestamp, 1, 10) as day_date,
      f.detected_category as category,
      COUNT(*) as count
    FROM feedback f
    JOIN stores s ON f.store_id = s.id
    WHERE ${whereClause}
    GROUP BY substr(f.timestamp, 1, 10), f.detected_category
    ORDER BY day_date ASC;
  `;
  const dailyRes = await db.query(dailySql, params);

  const timelineMap = {};
  for (const row of dailyRes.rows) {
    const d = row.day_date;
    if (!timelineMap[d]) {
      timelineMap[d] = {
        date: d,
        totalVolume: 0,
        categories: {},
      };
    }
    const cnt = parseInt(row.count, 10);
    timelineMap[d].totalVolume += cnt;
    timelineMap[d].categories[row.category] = cnt;
  }

  let timeline = Object.values(timelineMap);
  if (fillGaps && timeframe !== 'all') {
    const continuousTimeline = [];
    const today = new Date();
    const cursor = new Date(Date.now() - daysBack * 86400000);
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      if (timelineMap[dateStr]) {
        continuousTimeline.push(timelineMap[dateStr]);
      } else {
        continuousTimeline.push({
          date: dateStr,
          totalVolume: 0,
          categories: {},
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    timeline = continuousTimeline;
  }

  return {
    filters: {
      storeId: storeId || 'ALL',
      category: category || 'ALL',
      timeframe: timeframe || '30d',
      batchId: batchId || 'ALL',
    },
    summary: analysis.summary,
    storeWiseCounts: analysis.storeWiseCounts,
    categoryWiseCounts: analysis.categoryWiseCounts,
    storeCategoryMatrix: analysis.storeCategoryMatrix,
    spikes: analysis.spikes,
    recurringIssues: analysis.recurringIssues,
    prioritizedComplaints: analysis.prioritizedComplaints,
    unresolvedPrioritizedComplaints: analysis.unresolvedPrioritizedComplaints,
    dashboardAlerts: analysis.dashboardAlerts,
    timeline,
    validationWarnings: analysis.validationWarnings,
    metadata: {
      generatedAt: new Date().toISOString(),
      analyticsEngine: 'StoreGrid Unified Analytics + Priority Trends Module',
      totalInputRecords: complaints.length,
    },
  };
}

module.exports = {
  getDashboardSummary,
  getDashboardOverview,
  getTrends,
  getPriorityTrendsAnalytics,
};
