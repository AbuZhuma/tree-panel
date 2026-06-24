const express = require('express');
const db = require('../db');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/nodes — создать узел
router.post('/nodes', wrap(async (req, res) => {
  const { tree_id, parent_id = null, data = {} } = req.body;
  if (!tree_id) return res.status(400).json({ error: 'Поле tree_id обязательно' });

  const treeCheck = await db.query('SELECT id FROM trees WHERE id = $1', [tree_id]);
  if (treeCheck.rows.length === 0) {
    return res.status(400).json({ error: 'Дерево не найдено' });
  }

  // Проверяем, что родитель принадлежит тому же дереву
  if (parent_id != null) {
    const parentCheck = await db.query(
      'SELECT id FROM nodes WHERE id = $1 AND tree_id = $2',
      [parent_id, tree_id]
    );
    if (parentCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Родительский узел не найден в этом дереве' });
    }
  }

  // позиция = в конец среди соседей
  const posRes = await db.query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next
     FROM nodes WHERE tree_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
    [tree_id, parent_id]
  );
  const position = posRes.rows[0].next;

  const { rows } = await db.query(
    'INSERT INTO nodes (tree_id, parent_id, position, data) VALUES ($1, $2, $3, $4) RETURNING *',
    [tree_id, parent_id, position, JSON.stringify(data || {})]
  );
  res.status(201).json(rows[0]);
}));

// PUT /api/nodes/:id — обновить данные узла
router.put('/nodes/:id', wrap(async (req, res) => {
  const { data } = req.body;
  if (data === undefined || typeof data !== 'object' || data === null) {
    return res.status(400).json({ error: 'Поле data (объект) обязательно' });
  }
  const { rows } = await db.query(
    'UPDATE nodes SET data = $1 WHERE id = $2 RETURNING *',
    [JSON.stringify(data), req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Узел не найден' });
  res.json(rows[0]);
}));

// PUT /api/nodes/:id/move — сменить parent_id или position
router.put('/nodes/:id/move', wrap(async (req, res) => {
  const id = req.params.id;
  const { parent_id, position } = req.body;

  const nodeRes = await db.query('SELECT * FROM nodes WHERE id = $1', [id]);
  if (nodeRes.rows.length === 0) return res.status(404).json({ error: 'Узел не найден' });
  const node = nodeRes.rows[0];

  const newParent = parent_id !== undefined ? parent_id : node.parent_id;

  // Нельзя сделать узел потомком самого себя
  if (newParent != null && String(newParent) === String(id)) {
    return res.status(400).json({ error: 'Узел не может быть родителем самого себя' });
  }

  if (newParent != null) {
    // родитель должен быть в том же дереве
    const parentCheck = await db.query(
      'SELECT id FROM nodes WHERE id = $1 AND tree_id = $2',
      [newParent, node.tree_id]
    );
    if (parentCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Родительский узел не найден в этом дереве' });
    }

    // защита от цикла: новый родитель не должен быть потомком узла
    const cycleCheck = await db.query(
      `WITH RECURSIVE descendants AS (
         SELECT id FROM nodes WHERE id = $1
         UNION ALL
         SELECT n.id FROM nodes n JOIN descendants d ON n.parent_id = d.id
       )
       SELECT 1 FROM descendants WHERE id = $2`,
      [id, newParent]
    );
    if (cycleCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Нельзя переместить узел внутрь его собственного поддерева' });
    }
  }

  const newPosition = position !== undefined ? position : node.position;

  const { rows } = await db.query(
    'UPDATE nodes SET parent_id = $1, position = $2 WHERE id = $3 RETURNING *',
    [newParent, newPosition, id]
  );
  res.json(rows[0]);
}));

// DELETE /api/nodes/:id — удалить узел (каскадно удаляет детей)
router.delete('/nodes/:id', wrap(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM nodes WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Узел не найден' });
  res.json({ ok: true });
}));

module.exports = router;
