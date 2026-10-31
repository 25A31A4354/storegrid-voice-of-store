/**
 * Rule-Based Priority Scorer
 * Calculates transparent, explainable priority scores (0 - 100) and assigns priority levels.
 */

const {
  CATEGORY_WEIGHTS,
  PRIORITY_LEVELS,
  PRIORITY_THRESHOLDS,
  DEFAULT_CONFIG,
  HIGH_IMPACT_KEYWORDS
} = require('./constants');

/**
 * Determines the priority level based on the computed numeric score.
 */
function getPriorityLevel(score) {
  if (score >= PRIORITY_THRESHOLDS.CRITICAL_MIN) return PRIORITY_LEVELS.CRITICAL;
  if (score >= PRIORITY_THRESHOLDS.HIGH_MIN) return PRIORITY_LEVELS.HIGH;
  if (score >= PRIORITY_THRESHOLDS.MEDIUM_MIN) return PRIORITY_LEVELS.MEDIUM;
  return PRIORITY_LEVELS.LOW;
}

/**
 * Evaluates priority score and builds a detailed, explainable breakdown for a single complaint.
 * 
 * @param {Object} complaint - Sanitized complaint
 * @param {Object} context - Contextual data { recurrenceInfo, spikeLookup, referenceTime, config }
 * @returns {Object} { score, level, explanations, factorBreakdown }
 */
function scoreComplaint(complaint, context = {}) {
  const config = { ...DEFAULT_CONFIG, ...context.config };
  const recurrence = context.recurrenceInfo || { isRecurring: false };
  const spikeLookup = context.spikeLookup || {};
  const refTime = context.referenceTime ? new Date(context.referenceTime) : new Date();

  let score = 0;
  const explanations = [];
  const factorBreakdown = {};

  // 1. Category Base Weight
  const baseWeight = CATEGORY_WEIGHTS[complaint.category] || CATEGORY_WEIGHTS.NEEDS_REVIEW;
  score += baseWeight;
  factorBreakdown.categoryBase = baseWeight;
  explanations.push(`Base weight for category ${complaint.category}: +${baseWeight} pts`);

  // 2. Recurring Issue Factor
  if (recurrence.isRecurring) {
    const recurringPts = config.recurringBonus;
    score += recurringPts;
    factorBreakdown.recurringBonus = recurringPts;
    explanations.push(
      `Recurring issue detected (+${recurringPts} pts): Matches resolved complaint ${recurrence.previousComplaintId} (${recurrence.matchingRule})`
    );
  }

  // 3. Active Spike Factor
  // Only applies if the complaint is relevant to the active spike:
  // (a) matches the specific store + category, and (b) was open or occurred within the spike window
  const catKey = `${complaint.storeId}:::${complaint.category}`;
  const activeSpike = spikeLookup[catKey];
  if (activeSpike && complaint.status !== 'RESOLVED' && complaint.status !== 'CLOSED') {
    const spikePts = config.activeSpikeBonus;
    score += spikePts;
    factorBreakdown.spikeBonus = spikePts;
    explanations.push(
      `Active complaint spike (+${spikePts} pts): ${activeSpike.alertMessage}`
    );
  }

  // 4. Aging / Unresolved Duration Factor
  if (complaint.status !== 'RESOLVED' && complaint.status !== 'CLOSED' && complaint.createdAt) {
    const ageHours = (refTime.getTime() - complaint.createdAt.getTime()) / (1000 * 60 * 60);
    if (ageHours >= 48) {
      const agingPts = config.aging48hBonus;
      score += agingPts;
      factorBreakdown.agingBonus = agingPts;
      explanations.push(`Aging complaint (+${agingPts} pts): Unresolved for ${ageHours.toFixed(0)} hours (> 48h)`);
    } else if (ageHours >= 24) {
      const agingPts = config.aging24hBonus;
      score += agingPts;
      factorBreakdown.agingBonus = agingPts;
      explanations.push(`Aging complaint (+${agingPts} pts): Unresolved for ${ageHours.toFixed(0)} hours (> 24h)`);
    }
  }

  // 5. High-Impact Keyword Factor
  const textToScan = `${complaint.subject || ''} ${complaint.details || ''}`.toLowerCase();
  const matchedKeywords = HIGH_IMPACT_KEYWORDS.filter(keyword => textToScan.includes(keyword));
  if (matchedKeywords.length > 0) {
    const keywordPts = config.highImpactKeywordsBonus;
    score += keywordPts;
    factorBreakdown.keywordBonus = keywordPts;
    explanations.push(`High-impact keyword(s) matched [${matchedKeywords.join(', ')}]: +${keywordPts} pts`);
  }

  // 6. Clamp score between 0 and 100
  const finalScore = Math.min(100, Math.max(0, score));
  const level = getPriorityLevel(finalScore);

  return {
    score: finalScore,
    level,
    explanations,
    factorBreakdown
  };
}

module.exports = {
  scoreComplaint,
  getPriorityLevel
};
