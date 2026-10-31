/**
 * Sudden Complaint Spike Detector
 * Compares complaint frequency between a recent time window and the preceding time window.
 */

const { DEFAULT_CONFIG } = require('./constants');

/**
 * Detects sudden spikes in complaints per store and category.
 *
 * @param {Array} complaints - Sanitized complaint records
 * @param {Object} options - Optional configuration overrides
 * @param {Date|string} options.referenceTime - Base timestamp (defaults to latest complaint time or now)
 * @param {number} options.windowHours - Size of the comparison window in hours (default 24h)
 * @param {number} options.ratioThreshold - Minimum ratio of (recent / previous) to consider a spike (default 2.0)
 * @param {number} options.minVolume - Minimum complaints in recent window to prevent false alarms (default 3)
 * @returns {Object} { spikes: Array, spikeLookup: Object, windowDetails: Object }
 */
function detectSpikes(complaints = [], options = {}) {
  if (!complaints || complaints.length === 0) {
    return {
      spikes: [],
      spikeLookup: {},
      windowDetails: null
    };
  }

  const windowHours = options.windowHours || DEFAULT_CONFIG.spikeWindowHours;
  const ratioThreshold = options.ratioThreshold || DEFAULT_CONFIG.spikeRatioThreshold;
  const minVolume = options.minVolume || DEFAULT_CONFIG.minSpikeVolume;

  // Determine reference time: provided option, or latest complaint date, or now
  let refTime;
  if (options.referenceTime) {
    refTime = new Date(options.referenceTime);
  } else {
    // Pick the most recent createdAt timestamp among complaints
    const timestamps = complaints
      .map(c => c.createdAt ? c.createdAt.getTime() : 0)
      .filter(t => t > 0);
    refTime = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date();
  }

  const windowMs = windowHours * 60 * 60 * 1000;
  const recentStart = new Date(refTime.getTime() - windowMs);
  const previousStart = new Date(refTime.getTime() - 2 * windowMs);

  const windowDetails = {
    referenceTime: refTime.toISOString(),
    windowHours,
    recentWindow: {
      from: recentStart.toISOString(),
      to: refTime.toISOString()
    },
    previousWindow: {
      from: previousStart.toISOString(),
      to: recentStart.toISOString()
    }
  };

  // Buckets: key = `${storeId}:::${category}`
  const recentCounts = {};
  const previousCounts = {};

  for (const c of complaints) {
    if (!c.createdAt) continue;
    const time = c.createdAt.getTime();
    const key = `${c.storeId}:::${c.category}`;

    if (time >= recentStart.getTime() && time <= refTime.getTime()) {
      recentCounts[key] = (recentCounts[key] || 0) + 1;
    } else if (time >= previousStart.getTime() && time < recentStart.getTime()) {
      previousCounts[key] = (previousCounts[key] || 0) + 1;
    }
  }

  const spikes = [];
  const spikeLookup = {}; // Enables fast O(1) checks during priority scoring

  // Evaluate all keys seen in recent window
  for (const key of Object.keys(recentCounts)) {
    const recent = recentCounts[key] || 0;
    const previous = previousCounts[key] || 0;
    const [storeId, category] = key.split(':::');

    let isSpike = false;
    let ratio = 0;
    let surgeType = 'NORMAL';

    if (recent >= minVolume) {
      if (previous === 0) {
        // Emerging spike from zero baseline
        isSpike = true;
        ratio = recent; // absolute jump
        surgeType = 'NEW_SURGE';
      } else {
        ratio = Number((recent / previous).toFixed(2));
        if (ratio >= ratioThreshold) {
          isSpike = true;
          surgeType = 'VOLUME_MULTIPLIER';
        }
      }
    }

    if (isSpike) {
      const severity = (ratio >= 3.0 || recent >= 6) ? 'HIGH' : 'MODERATE';
      const spikeObj = {
        storeId,
        category,
        recentCount: recent,
        previousCount: previous,
        ratio,
        surgeType,
        severity,
        windowHours,
        alertMessage: surgeType === 'NEW_SURGE'
          ? `Sudden surge of ${recent} ${category} complaints at ${storeId} (zero in previous ${windowHours}h)`
          : `Sudden ${ratio}x spike in ${category} at ${storeId} (${recent} recent vs ${previous} in previous ${windowHours}h)`
      };

      spikes.push(spikeObj);
      spikeLookup[key] = spikeObj;
      spikeLookup[`${storeId}:::*`] = spikeObj; // Flag entire store as having an active spike
    }
  }

  // Sort spikes by severity and volume descending
  spikes.sort((a, b) => b.recentCount - a.recentCount);

  return {
    spikes,
    spikeLookup,
    windowDetails
  };
}

module.exports = {
  detectSpikes
};
