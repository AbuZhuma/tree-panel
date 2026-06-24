// Простой раннер миграций: выполняет все .sql из server/migrations по порядку.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function run() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    process.stdout.write(`Применяю ${file}... `);
    await pool.query(sql);
    console.log('ок');
  }

  await pool.end();
  console.log('Миграции выполнены.');
}

run().catch((err) => {
  console.error('Ошибка миграции:', err.message);
  process.exit(1);
});
