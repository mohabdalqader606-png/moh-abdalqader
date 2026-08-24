const express = require('express');
const pool = require('../../db/pool');
const { requireAuth, requireAdmin } = require('../auth');
const { scanAndImportAll } = require('../importer');
const { recomputeAll } = require('../recompute');

const router = express.Router();

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const importResult = await scanAndImportAll();
  const recomputeResult = await recomputeAll();
  res.json({ importResult, recomputeResult });
});

router.get('/history', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM imported_files ORDER BY imported_at DESC LIMIT 100');
  res.json(rows);
});

module.exports = router;
