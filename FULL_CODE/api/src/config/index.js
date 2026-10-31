require('dotenv').config({ quiet: true });

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  host: process.env.HOST || '127.0.0.1', // set HOST=0.0.0.0 on a server
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/storegrid?schema=public',
  useDbFallback: process.env.USE_DB_FALLBACK || 'auto', // 'always', 'auto', 'never'
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5,
  maxCsvRecords: parseInt(process.env.MAX_CSV_RECORDS, 10) || 5000,
  spikeThresholdFactor: parseFloat(process.env.SPIKE_THRESHOLD_FACTOR) || 2.0,
  spikeMinCount: parseInt(process.env.SPIKE_MIN_COUNT, 10) || 3,
  nlpServiceUrl: (process.env.NLP_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
  nlpTimeoutMs: parseInt(process.env.NLP_TIMEOUT_MS, 10) || 3000,
};

module.exports = config;
