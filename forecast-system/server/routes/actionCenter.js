const express = require('express');
const pool = require('../../db/pool');
const { requireAuth } = require('../auth');
const { repScopeSql } = require('../scope');
const { isoDate, addWorkingDays } = require('../workdays');
const { getCalendarAndSettings } = require('../settingsStore');

const router = express.Router();

function reason(g, type) {
  const medInt = g.median_interval != null ? (+g.median_interval).toFixed(1) : '—';
  if (type === 'dueNow') return `موعد السحب المتوقع حان${g.overdue_wd > 0 ? ' (متأخر ' + g.overdue_wd + ' يوم عمل)' : ''} — بناءً على متوسط فترة ${medInt} يوم عمل بين السحوبات.`;
  if (type === 'due3') return `يُتوقع الطلب خلال ${Math.abs(g.overdue_wd)} يوم عمل تقريباً، بناءً على ${g.n_obs} سحبة سابقة.`;
  if (type === 'due7') return `يُتوقع الطلب خلال أسبوع تقريباً (${Math.abs(g.overdue_wd)} يوم عمل)، بناءً على النمط المعتاد.`;
  if (type === 'missed') return `تجاوز العميل نمطه المعتاد بفارق كبير (${g.overdue_wd} يوم عمل عن الموعد المتوقع، مقابل فترة معتادة ${medInt} يوم) — احتمال توقف الطلب أو التحول لمورد آخر.`;
  if (type === 'anomaly') return `آخر سحبة كانت ${g.anomaly_dir === 'high' ? 'أعلى' : 'أقل'} بشكل غير معتاد من الوسيط التاريخي ${g.median_qty != null ? (+g.median_qty).toFixed(0) : '—'}.`;
  if (type === 'growth') return `الكمية المسحوبة في اتجاه تصاعدي مستمر (تغيّر تقديري ${(g.rel_slope * 100).toFixed(0)}% عبر آخر ${g.n_obs} سحبة).`;
  return '';
}
function recAction(type) {
  return {
    dueNow: 'يوصى بالتواصل مع العميل خلال يوم عمل واحد.',
    due3: 'يوصى بالتواصل خلال 1-2 يوم عمل قبل الموعد المتوقع.',
    due7: 'أدرجه في خطة التواصل لهذا الأسبوع.',
    missed: 'تواصل فوري لمعرفة السبب قبل فقدان العميل على هذا الصنف.',
    anomaly: 'تحقق من سبب الانحراف (طلبية استثنائية، مشكلة تخزين، أو تحول جزئي لمورد آخر).',
    growth: 'فرصة لزيادة السقف المقترح أو عرض بيع إضافي على هذا الصنف.',
  }[type];
}

router.get('/', requireAuth, async (req, res) => {
  const { rep, custCategory, itemCategory, q, minConf } = req.query;
  const params = [];
  let where = 'WHERE 1=1';
  where += repScopeSql(req, 'rep', params);
  if (rep) { params.push(rep); where += ` AND rep = $${params.length}`; }
  if (custCategory) { params.push(custCategory); where += ` AND cust_category = $${params.length}`; }
  if (itemCategory) { params.push(itemCategory); where += ` AND item_category = $${params.length}`; }
  if (minConf) { params.push(+minConf); where += ` AND confidence >= $${params.length}`; }
  if (q) { params.push(`%${q}%`); where += ` AND (cust_name ILIKE $${params.length} OR cust_code ILIKE $${params.length} OR item_name ILIKE $${params.length} OR item_code ILIKE $${params.length})`; }

  const { rows: rawRows } = await pool.query(
    `SELECT f.*,
       q.quote_date, q.qty AS quote_qty, q.open_qty AS quote_open_qty,
       r.invoice_date, r.undelivered_qty
     FROM forecasts f
     LEFT JOIN LATERAL (
       SELECT quote_date, qty, open_qty FROM quotes
       WHERE cust_code=f.cust_code AND item_code=f.item_code AND quote_date >= f.last_wd_date
       ORDER BY quote_date DESC LIMIT 1
     ) q ON true
     LEFT JOIN LATERAL (
       SELECT invoice_date, undelivered_qty FROM reserved_invoices
       WHERE cust_code=f.cust_code AND item_code=f.item_code AND invoice_date >= f.last_wd_date
       ORDER BY invoice_date DESC LIMIT 1
     ) r ON true
     ${where} ORDER BY f.cust_name,f.item_name`,
    params
  );
  const rows = rawRows.map((g) => {
    let signal = null;
    if (g.invoice_date) signal = { kind: 'reserved', date: g.invoice_date, qty: g.undelivered_qty };
    else if (g.quote_date) signal = { kind: 'quote', date: g.quote_date, qty: g.quote_open_qty != null ? g.quote_open_qty : g.quote_qty };
    return { ...g, signal };
  });

  // استبعاد التنبيهات المخفية عبر سجل الإجراءات (تم التواصل اليوم / مؤجل / مغلق نهائياً)
  const today = isoDate(new Date());
  const { rows: logs } = await pool.query(
    `SELECT DISTINCT ON (cust_code,item_code,alert_type) cust_code,item_code,alert_type,status,at,snooze_until
     FROM action_log ORDER BY cust_code,item_code,alert_type,created_at DESC`
  );
  const suppressed = new Set();
  logs.forEach((l) => {
    const suppress = l.status === 'done' || (l.status === 'snoozed' && l.snooze_until && l.snooze_until >= today) || (l.status === 'contacted' && l.at === today);
    if (suppress) suppressed.add(l.cust_code + '||' + l.item_code + '||' + l.alert_type);
  });

  const buckets = { dueNow: [], due3: [], due7: [], missed: [], anomaly: [], growth: [] };
  const insufficientCount = rows.filter((g) => g.status === 'insufficient').length;
  const withReason = (g, type) => ({ ...g, reason: reason(g, type), recommendedAction: recAction(type) });

  rows.forEach((g) => {
    const key = g.cust_code + '||' + g.item_code;
    if (g.status === 'dueNow' && !suppressed.has(key + '||dueNow')) buckets.dueNow.push(withReason(g, 'dueNow'));
    else if (g.status === 'due3' && !suppressed.has(key + '||due3')) buckets.due3.push(withReason(g, 'due3'));
    else if (g.status === 'due7' && !suppressed.has(key + '||due7')) buckets.due7.push(withReason(g, 'due7'));
    if (g.status === 'missed' && !suppressed.has(key + '||missed')) buckets.missed.push(withReason(g, 'missed'));
    if (g.anomaly_dir && !suppressed.has(key + '||anomaly')) buckets.anomaly.push(withReason(g, 'anomaly'));
    if (g.trend === 'up' && g.n_obs >= 4 && !suppressed.has(key + '||growth')) buckets.growth.push(withReason(g, 'growth'));
  });

  res.json({ buckets, insufficientCount, total: rows.length });
});

router.post('/action', requireAuth, async (req, res) => {
  const { custCode, itemCode, alertType, status, snoozeDays } = req.body || {};
  if (!custCode || !itemCode || !alertType || !status) return res.status(400).json({ error: 'بيانات ناقصة' });
  let snoozeUntil = null;
  if (status === 'snoozed' && snoozeDays) {
    const { cal } = await getCalendarAndSettings();
    snoozeUntil = addWorkingDays(isoDate(new Date()), snoozeDays, cal);
  }
  await pool.query(
    'INSERT INTO action_log(cust_code,item_code,alert_type,status,snooze_until,user_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [custCode, itemCode, alertType, status, snoozeUntil, req.user.sub]
  );
  res.json({ ok: true });
});

router.get('/meta', requireAuth, async (req, res) => {
  const params = [];
  const where = 'WHERE 1=1' + repScopeSql(req, 'rep', params);
  const [reps, ccats, icats] = await Promise.all([
    pool.query(`SELECT DISTINCT rep FROM forecasts ${where} AND rep <> '' ORDER BY rep`, params),
    pool.query(`SELECT DISTINCT cust_category FROM forecasts ${where} AND cust_category <> '' ORDER BY cust_category`, params),
    pool.query(`SELECT DISTINCT item_category FROM forecasts ${where} AND item_category <> '' ORDER BY item_category`, params),
  ]);
  res.json({
    reps: reps.rows.map((r) => r.rep),
    custCategories: ccats.rows.map((r) => r.cust_category),
    itemCategories: icats.rows.map((r) => r.item_category),
  });
});

module.exports = router;
