const express = require('express');
const pool = require('../../db/pool');
const { requireAuth } = require('../auth');
const { getCalendarAndSettings } = require('../settingsStore');
const { analyzeGroup, groupByPair, mean } = require('../forecast');
const { workingDaysBetween } = require('../workdays');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const params = [];
  let where = 'WHERE 1=1';
  if (req.user.role !== 'admin') {
    params.push(req.user.repName || '__none__');
    where += ` AND EXISTS (SELECT 1 FROM forecasts f WHERE f.cust_code=a.cust_code AND f.item_code=a.item_code AND f.rep=$${params.length})`;
  }
  const { rows } = await pool.query(`SELECT * FROM accuracy_log a ${where} ORDER BY logged_at DESC LIMIT 300`, params);
  const errDaysAbs = rows.map((r) => Math.abs(r.err_days)).filter((v) => v != null && !isNaN(v));
  const errPct = rows.filter((r) => r.err_qty_pct != null).map((r) => +r.err_qty_pct);
  res.json({
    log: rows,
    mae: errDaysAbs.length ? mean(errDaysAbs) : null,
    mape: errPct.length ? mean(errPct) : null,
    count: rows.length,
  });
});

router.post('/backtest', requireAuth, async (req, res) => {
  const params = [];
  let where = 'WHERE 1=1';
  if (req.user.role !== 'admin') { params.push(req.user.repName || '__none__'); where += ` AND rep = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT cust_code,cust_name,item_code,item_name,wd_date,qty,uom,rep,cust_category,item_category FROM withdrawals w
     WHERE (w.cust_code, w.item_code) IN (SELECT cust_code,item_code FROM forecasts f2 ${where.replace('rep', 'f2.rep')})
     ORDER BY cust_code,item_code,wd_date`,
    params
  );
  const { settings, cal } = await getCalendarAndSettings();
  const groups = groupByPair(rows);
  const results = [];
  groups.forEach((g) => {
    if (g.events.length < 4) return;
    const sub = g.events.slice(0, -1);
    const actual = g.events[g.events.length - 1];
    const boundary = sub[sub.length - 1].date;
    const a = analyzeGroup(sub, boundary, cal, settings);
    if (!a.expDate) return;
    results.push({
      custName: g.custName, itemName: g.itemName,
      predictedDate: a.expDate, actualDate: actual.date,
      errDays: workingDaysBetween(a.expDate, actual.date, cal),
      predictedQty: a.expQty, actualQty: actual.qty,
      errQtyPct: actual.qty ? Math.abs((a.expQty || 0) - actual.qty) / actual.qty * 100 : null,
    });
  });
  const mae = results.length ? mean(results.map((r) => Math.abs(r.errDays))) : null;
  const withPct = results.filter((r) => r.errQtyPct != null);
  const mape = withPct.length ? mean(withPct.map((r) => r.errQtyPct)) : null;
  res.json({ results, mae, mape, count: results.length });
});

module.exports = router;
