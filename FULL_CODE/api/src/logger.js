const pino = require('pino');

/** Shared structured logger. LOG_LEVEL sets verbosity (npm test runs with "silent"). */
module.exports = pino({ level: process.env.LOG_LEVEL || 'info', base: { service: 'storegrid-api' } });
