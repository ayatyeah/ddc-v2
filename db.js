/**
 * db.js — пул подключений к PostgreSQL DigitalOcean.
 * Креды берутся из .env (PGUSER/PGPASSWORD/PGHOST/PGPORT/PGDATABASE).
 * DigitalOcean требует SSL (sslmode=require).
 */
require('dotenv').config();
const { Pool } = require('pg');

const useSSL = (process.env.PGSSLMODE || 'require') !== 'disable';

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 25060,
  database: process.env.PGDATABASE,
  // DigitalOcean managed DB использует self-signed цепочку — rejectUnauthorized:false.
  // Если у тебя есть CA-сертификат DO, лучше передать его в ssl.ca и поставить true.
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Неожиданная ошибка пула PostgreSQL:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
