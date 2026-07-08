/**
 * init-db.js — применяет schema.sql к базе. Запуск: `npm run init-db`.
 * Безопасно запускать повторно (CREATE TABLE IF NOT EXISTS / OR REPLACE).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✓ Схема применена: таблица leads готова.');
  } catch (e) {
    console.error('✗ Ошибка применения схемы:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
