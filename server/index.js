require('dotenv').config();
const path = require('path');
const express = require('express');

const schemasRouter = require('./routes/schemas');
const treesRouter = require('./routes/trees');
const nodesRouter = require('./routes/nodes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API
app.use('/api', schemasRouter);
app.use('/api', treesRouter);
app.use('/api', nodesRouter);

// Статика фронтенда
app.use(express.static(path.join(__dirname, '..', 'public')));

// Централизованный обработчик ошибок
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`Tree Builder Panel запущен на http://localhost:${PORT}`);
});
