const express = require('express');
const { spawn } = require('child_process');

const router = express.Router();

router.get('/export', (req, res) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return res.status(500).json({ error: 'DATABASE_URL не задан' });
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `treebuilder_dump_${stamp}.sql`;

  const dump = spawn('pg_dump', ['--no-owner', '--no-privileges', connectionString]);

  let started = false;
  let stderr = '';

  dump.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  dump.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Не удалось запустить pg_dump: ' + err.message });
    }
  });

  dump.stdout.on('data', (chunk) => {
    if (!started) {
      started = true;
      res.setHeader('Content-Type', 'application/sql; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    res.write(chunk);
  });

  dump.on('close', (code) => {
    if (code === 0) {
      if (!started) {
        res.setHeader('Content-Type', 'application/sql; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
      res.end();
    } else if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка pg_dump: ' + (stderr.trim() || 'код ' + code) });
    } else {
      res.end();
    }
  });
});

module.exports = router;
