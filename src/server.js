require('dotenv').config({ quiet: true });

const app = require('./app');
const pool = require('./config/db');

const port = Number(process.env.PORT || 5000);

async function startServer() {
  await pool.query('SELECT 1');

  const server = app.listen(port, () => {
    console.info(`Task Manager is listening on http://localhost:${port}`);
  });

  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.info(`${signal} received; shutting down gracefully.`);

    server.close(async (serverError) => {
      try {
        await pool.end();
        if (serverError) {
          console.error('HTTP server shutdown failed:', serverError.message);
          process.exitCode = 1;
        }
      } catch (error) {
        console.error('Database pool shutdown failed:', error.code || error.name);
        process.exitCode = 1;
      }
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch(async (error) => {
  console.error('Application startup failed:', error.code || error.message);
  try {
    await pool.end();
  } catch (shutdownError) {
    console.error('Database pool shutdown failed:', shutdownError.code || shutdownError.name);
  }
  process.exitCode = 1;
});
