const express = require('express');
const pool = require('../../db/pool');
const { requireAuth, requireAdmin } = require('../auth');
const { getCalendarAndSettings, saveSettingKeys } = require('../settingsStore');
const { recomputeAll } = require('../recompute');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { settings, holidays } = await getCalendarAndSettings();
  res.json({ settings, holidays });
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const allowed = ['offDays', 'grace', 'graceMissedMult', 'leadTimeDays', 'alphaInterval', 'alphaQty', 'growthThreshold'];
  const patch = {};
  for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
  await saveSettingKeys(patch);
  const result = await recomputeAll();
  res.json({ ok: true, recomputed: result });
});

router.post('/holidays', requireAuth, requireAdmin, async (req, res) => {
  const { date, description } = req.body || {};
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  await pool.query('INSERT INTO holidays(hol_date,description) VALUES ($1,$2) ON CONFLICT (hol_date) DO UPDATE SET description=$2', [date, description || '']);
  const result = await recomputeAll();
  res.json({ ok: true, recomputed: result });
});

router.delete('/holidays/:date', requireAuth, requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM holidays WHERE hol_date=$1', [req.params.date]);
  const result = await recomputeAll();
  res.json({ ok: true, recomputed: result });
});

module.exports = router;
