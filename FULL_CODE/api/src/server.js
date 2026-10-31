const app = require('./app');
const config = require('./config');
const db = require('./db');
const logger = require('./logger');

let server = null;

function announce(port) {
  logger.info(
    { port, health: `http://localhost:${port}/api/health`, db: db.getDbStatus().mode },
    'StoreGrid API listening'
  );
}

async function startServer() {
  try {
    logger.info({ env: config.nodeEnv }, 'Starting StoreGrid API');

    // Initialize Database (PostgreSQL with SQLite fallback)
    await db.initDb();

    server = app.listen(config.port, config.host, () => announce(config.port));

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const fallbackPort = config.port + 1;
        logger.warn({ port: config.port, fallbackPort }, 'Port in use (e.g. macOS AirPlay), using the fallback port');
        server = app.listen(fallbackPort, config.host, () => announce(fallbackPort));
      } else {
        logger.error({ err }, 'Server error');
      }
    });

    // Graceful shutdown
    const handleShutdown = async (signal) => {
      logger.info({ signal }, 'Shutting down');
      if (server) {
        server.close(async () => {
          await db.closeDb();
          logger.info('HTTP server and database closed');
          process.exit(0);
        });
      } else {
        await db.closeDb();
        process.exit(0);
      }
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (err) {
    logger.fatal({ err }, 'Fatal error during startup');
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
};
