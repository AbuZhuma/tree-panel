const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/trees', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, s.name AS schema_name
     FROM trees t
     LEFT JOIN schemas s ON s.id = t.schema_id
     ORDER BY t.id`
  );
  res.json(rows);
}));

router.post('/trees', wrap(async (req, res) => {
  const { schema_id, title } = req.body;
  if (!schema_id) return res.status(400).json({ error: 'Поле schema_id обязательно' });
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'Поле title обязательно' });
  }

  const schemaCheck = await db.query('SELECT id FROM schemas WHERE id = $1', [schema_id]);
  if (schemaCheck.rows.length === 0) {
    return res.status(400).json({ error: 'Схема не найдена' });
  }

  const { rows } = await db.query(
    'INSERT INTO trees (schema_id, title) VALUES ($1, $2) RETURNING *',
    [schema_id, String(title).trim()]
  );
  res.status(201).json(rows[0]);
}));

router.delete('/trees/:id', wrap(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM trees WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Дерево не найдено' });
  res.json({ ok: true });
}));

router.get('/trees/:id/nodes', wrap(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM nodes WHERE tree_id = $1 ORDER BY parent_id NULLS FIRST, position, id',
    [req.params.id]
  );
  res.json(rows);
}));

module.exports = router;
