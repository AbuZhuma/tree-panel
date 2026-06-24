const express = require('express');
const db = require('../db');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const FIELD_TYPES = ['text', 'number', 'date', 'select'];

router.get('/schemas', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM schemas ORDER BY id');
  res.json(rows);
}));

router.post('/schemas', wrap(async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Поле name обязательно' });
  }
  const { rows } = await db.query(
    'INSERT INTO schemas (name) VALUES ($1) RETURNING *',
    [String(name).trim()]
  );
  res.status(201).json(rows[0]);
}));

router.delete('/schemas/:id', wrap(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM schemas WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Схема не найдена' });
  res.json({ ok: true });
}));

router.get('/schemas/:id/fields', wrap(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM schema_fields WHERE schema_id = $1 ORDER BY position, id',
    [req.params.id]
  );
  res.json(rows);
}));

router.post('/schemas/:id/fields', wrap(async (req, res) => {
  const schemaId = req.params.id;
  const { key, label, field_type = 'text', required = false, options = null } = req.body;

  if (!key || !String(key).trim()) {
    return res.status(400).json({ error: 'Поле key обязательно' });
  }
  if (!label || !String(label).trim()) {
    return res.status(400).json({ error: 'Поле label обязательно' });
  }
  if (!FIELD_TYPES.includes(field_type)) {
    return res.status(400).json({ error: `Недопустимый field_type. Доступно: ${FIELD_TYPES.join(', ')}` });
  }

  const posRes = await db.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM schema_fields WHERE schema_id = $1',
    [schemaId]
  );
  const position = posRes.rows[0].next;

  const { rows } = await db.query(
    `INSERT INTO schema_fields (schema_id, key, label, field_type, required, options, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      schemaId,
      String(key).trim(),
      String(label).trim(),
      field_type,
      !!required,
      options ? JSON.stringify(options) : null,
      position,
    ]
  );
  res.status(201).json(rows[0]);
}));

router.put('/schema-fields/:id', wrap(async (req, res) => {
  const { key, label, field_type, required, options, position } = req.body;

  if (field_type !== undefined && !FIELD_TYPES.includes(field_type)) {
    return res.status(400).json({ error: `Недопустимый field_type. Доступно: ${FIELD_TYPES.join(', ')}` });
  }

  const sets = [];
  const vals = [];
  let i = 1;
  const add = (col, val) => {
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  };

  if (key !== undefined) add('key', String(key).trim());
  if (label !== undefined) add('label', String(label).trim());
  if (field_type !== undefined) add('field_type', field_type);
  if (required !== undefined) add('required', !!required);
  if (options !== undefined) add('options', options ? JSON.stringify(options) : null);
  if (position !== undefined) add('position', position);

  if (sets.length === 0) {
    return res.status(400).json({ error: 'Нет полей для обновления' });
  }

  vals.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE schema_fields SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Поле не найдено' });
  res.json(rows[0]);
}));

router.delete('/schema-fields/:id', wrap(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM schema_fields WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Поле не найдено' });
  res.json({ ok: true });
}));

module.exports = router;
