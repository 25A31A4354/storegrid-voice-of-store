const db = require('../db');
const config = require('../config');
const nlpService = require('../services/nlp.service');

const serverStartTime = Date.now();

/**
 * Health check endpoint
 * GET /api/health
 */
async function getHealth(req, res) {
  const dbStatus = db.getDbStatus();
  const uptimeSeconds = Math.round((Date.now() - serverStartTime) / 1000);
  const nlpHealth = await nlpService.checkHealth();

  const payload = {
    status: 'ok',
    service: 'storegrid-backend',
    version: '1.0.0',
    environment: config.nodeEnv,
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
    database: {
      connected: dbStatus.connected,
      mode: dbStatus.mode,
      isFallback: dbStatus.isFallback,
      notice: dbStatus.limitationNotice,
    },
    nlpService: nlpHealth,
    system: {
      nodeVersion: process.version,
      platform: process.platform,
    },
  };

  res.status(200).json(payload);
}

module.exports = {
  getHealth,
};
