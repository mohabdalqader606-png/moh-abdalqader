const express = require('express');
const pool = require('../../db/pool');
const { requireAuth } = require('../auth');
const { repScopeSql } = require('../scope');
const { isoDate, addWorkingDays } = require('../workdays');
const { getCalendarAndSettings } = require('../settingsStore');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const params = [];
  const where = 'WHERE 1=1' + repScopeSql(req, 'rep', params);
  const { rows } = await pool.query(
    `SELECT f.*,
       op.qty AS opening_qty, op.event_date AS opening_date,
       COALESCE(del.total,0) AS deliveries_total,
       COALESCE(wd.total,0) AS withdrawals_total
     FROM forecasts f
     LEFT JOIN LATERAL (
       SELECT qty, event_date FROM stock_feed
       WHERE cust_code=f.cust_code AND item_code=f.item_code AND event_type='opening'
       ORDER BY event_date DESC LIMIT 1
     ) op ON true
     LEFT JOIN LATERAL (
       SELECT SUM(qty) AS total FROM stock_feed
       WHERE cust_code=f.cust_code AND item_code=f.item_code AND event_type='delivery'
         AND event_date >= op.event_date AND event_date <= CURRENT_DATE
     ) del ON true
     LEFT JOIN LATERAL (
       SELECT SUM(qty) AS total FROM withdrawals w
       WHERE w.cust_code=f.cust_code AND w.item_code=f.item_code
         AND w.wd_date >= op.event_date AND w.wd_date <= CURRENT_DATE
     ) wd ON true
     ${where}
     ORDER BY f.cust_name, f.item_name`,
    params
  );

  const { settings, cal } = await getCalendarAndSettings();
  const today = isoDate(new Date());
  const out = rows.map((r) => {
    if (r.opening_date == null) return { ...r, known: false };
    const est = +r.opening_qty + (+r.deliveries_total) - (+r.withdrawals_total);
    const dailyCons = r.avg_interval && r.avg_qty ? (+r.avg_qty) / (+r.avg_interval) : null;
    const safety = (r.mad_qty ? +r.mad_qty : 0) * 1.4826 * 0.5;
    const reorderPoint = dailyCons != null ? dailyCons * settings.leadTimeDays + safety : null;
    let daysToReorder = null, reorderDate = null;
    if (dailyCons && reorderPoint != null) {
      daysToReorder = Math.ceil((est - reorderPoint) / dailyCons);
      reorderDate = addWorkingDays(today, Math.max(0, daysToReorder), cal);
    }
    return { ...r, known: true, est, reorderPoint, daysToReorder, reorderDate };
  });
  res.json(out);
});

module.exports = router;
