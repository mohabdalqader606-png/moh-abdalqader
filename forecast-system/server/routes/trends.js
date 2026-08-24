const express = require('express');
const pool = require('../../db/pool');
const { requireAuth } = require('../auth');
const { repScopeSql } = require('../scope');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const params = [];
  const where = 'WHERE 1=1' + repScopeSql(req, 'rep', params);

  const { rows: byItem } = await pool.query(
    `SELECT f.item_code, MAX(f.item_name) AS item_name, COUNT(*)::int AS customers,
            SUM(f.rel_slope) AS total_slope,
            (SELECT COALESCE(SUM(w.qty),0) FROM withdrawals w WHERE w.item_code = f.item_code) AS total_qty
     FROM forecasts f ${where}
     GROUP BY f.item_code ORDER BY total_slope DESC`,
    params
  );

  const { rows: byRep } = await pool.query(
    `SELECT COALESCE(NULLIF(rep,''),'—') AS rep, COUNT(*)::int AS pairs,
            SUM((status='dueNow')::int) AS due_now,
            SUM((status='missed')::int) AS missed,
            SUM((trend='up' AND n_obs>=4)::int) AS growth
     FROM forecasts ${where}
     GROUP BY rep ORDER BY rep`,
    params
  );

  res.json({ byItem, byRep });
});

module.exports = router;
