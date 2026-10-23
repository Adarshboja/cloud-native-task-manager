const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

function createPool() {
  const databaseUrl = process.env.DATABASE_URL;
  const requiredVariables = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missingVariables = databaseUrl
    ? []
    : requiredVariables.filter((name) => !process.env[name]);

  if (missingVariables.length > 0) {
    throw new Error(`Missing required database configuration: ${missingVariables.join(', ')}`);
  }

  const pool = new Pool(
    databaseUrl
      ? { connectionString: databaseUrl }
      : {
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT || 5432),
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
        },
  );

  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error.code || 'unknown error');
  });

  return pool;
}

const pool = createPool();

module.exports = pool;
