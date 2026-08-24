const express = require('express');
const pool = require('../../db/pool');
const { requireAuth } = require('../auth');
const { repScopeSql } = require('../scope');
const { workingDaysBetween } = require('../workdays');
const { getCalendarAndSettings } = require('../settingsStore');

const router = express.Router();

router.get('/list', requireAuth, async (req, res) => {
  const params = [];
  const where = 'WHERE 1=1' + repScopeSql(req, 'rep', params);
  const { rows } = await pool.query(
    `SELECT cust_code,item_code,cust_name,item_name FROM forecasts ${where} ORDER BY cust_name,item_name`,
    params
  );
  res.json(rows);
});

router.get('/:custCode/:itemCode', requireAuth, async (req, res) => {
  const { custCode, itemCode } = req.params;
  const params = [custCode, itemCode];
  const where = 'WHERE cust_code=$1 AND item_code=$2' + repScopeSql(req, 'rep', params);
  const { rows } = await pool.query(`SELECT * FROM forecasts ${where}`, params);
  if (!rows.length) return res.status(404).json({ error: 'غير موجود أو خارج نطاق صلاحيتك' });
  const g = rows[0];

  const { rows: events } = await pool.query(
    'SELECT wd_date,qty FROM withdrawals WHERE cust_code=$1 AND item_code=$2 ORDER BY wd_date',
    [custCode, itemCode]
  );
  const { cal } = await getCalendarAndSettings();
  const history = events.map((e, i) => ({
    date: e.wd_date,
    qty: +e.qty,
    intervalWD: i === 0 ? null : workingDaysBetween(events[i - 1].wd_date, e.wd_date, cal),
  }));

  res.json({ forecast: g, history });
});

module.exports = router;
