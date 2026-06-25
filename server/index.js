require('dotenv').config();
const path = require('path');
const express = require('express');

const schemasRouter = require('./routes/schemas');
const treesRouter = require('./routes/trees');
const nodesRouter = require('./routes/nodes');
const exportRouter = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_HOST = (process.env.PUBLIC_HOST || 'binar.neo.pw').toLowerCase();

app.use(express.json());

app.use('/api', schemasRouter);
app.use('/api', treesRouter);
app.use('/api', nodesRouter);
app.use('/api', exportRouter);

const panelStatic = express.static(path.join(__dirname, '..', 'public'));
const viewerStatic = express.static(path.join(__dirname, '..', 'viewer'));

app.use((req, res, next) => {
  const host = String(req.hostname || '').toLowerCase();
  if (host === PUBLIC_HOST) {
    return viewerStatic(req, res, next);
  }
  return panelStatic(req, res, next);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Внутренняя ошибка сервера' });
});

app.listen(PORT, HOST, () => {
  console.log(`Tree Builder Panel запущен на http://${HOST}:${PORT}`);
});
