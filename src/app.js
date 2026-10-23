const path = require('path');
const express = require('express');
const pool = require('./config/db');
const taskRoutes = require('./routes/taskRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  });
  next();
});

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    console.info(`${req.method} ${path} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});

app.use(express.json({ limit: '16kb' }));

app.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    return res.json({
      success: true,
      data: { status: 'ok', database: 'connected', timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return next(Object.assign(new Error('Database health check failed.'), {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
    }));
  }
});

app.use('/api/v1/tasks', taskRoutes);
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));
app.use(notFound);
app.use(errorHandler);

module.exports = app;
