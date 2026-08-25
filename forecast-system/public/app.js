let ME = null;
let CURRENT = 'action';
let ACTION_FILTERS = { rep: '', ccat: '', icat: '', q: '', minConf: 0 };
let DRILL_KEY = null;
let LAST_BACKTEST = null;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function fmtN(n, d) { if (n == null || isNaN(n)) return '—'; return (+n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d }); }
function fmtDate(iso) { if (!iso) return '—'; const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; }
const DOW_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

async function api(path, opts) {
  const res = await fetch('/api' + path, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts));
  if (res.status === 401) { showLogin(); throw new Error('غير مسجل الدخول'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ');
  return data;
}
function apiGet(path) { return api(path); }
function apiPost(path, body) { return api(path, { method: 'POST', body: JSON.stringify(body || {}) }); }
function apiPatch(path, body) { return api(path, { method: 'PATCH', body: JSON.stringify(body || {}) }); }
function apiDelete(path) { return api(path, { method: 'DELETE' }); }

function showLogin() {
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('app').style.display = 'none';
}
function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}
async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  document.getElementById('loginErr').textContent = '';
  try {
    ME = await apiPost('/auth/login', { username, password });
    showApp();
    document.getElementById('whoami').textContent = `${ME.username} (${ME.role === 'admin' ? 'Admin' : 'مندوب: ' + (ME.repName || '')})`;
    render();
  } catch (e) { document.getElementById('loginErr').textContent = e.message; }
}
async function doLogout() { await apiPost('/auth/logout'); ME = null; showLogin(); }

async function boot() {
  try {
    ME = await apiGet('/auth/me');
    showApp();
    document.getElementById('whoami').textContent = `${ME.username} (${ME.role === 'admin' ? 'Admin' : 'مندوب: ' + (ME.repName || '')})`;
    render();
  } catch (e) { showLogin(); }
}

function TABS() {
  const t = [
    ['action', '🎯 مركز إجراءات اليوم'],
    ['drill', '🔍 تحليل عميل×صنف'],
    ['trends', '📈 اتجاهات الطلب'],
    ['stock', '🏬 المخزون التقديري'],
    ['accuracy', '✅ دقة التوقعات'],
  ];
  if (ME && ME.role === 'admin') {
    t.push(['sync', '🔄 استيراد ومزامنة']);
    t.push(['settings', '⚙️ الإعدادات']);
    t.push(['users', '👤 المستخدمون']);
  }
  return t;
}
function switchTab(t) { CURRENT = t; render(); }
function renderNav() {
  document.getElementById('nav').innerHTML = TABS().map(([k, l]) => `<button class="${k === CURRENT ? 'on' : ''}" onclick="switchTab('${k}')">${l}</button>`).join('');
}

async function render() {
  renderNav();
  const m = document.getElementById('main');
  m.innerHTML = '<div class="card">جاري التحميل...</div>';
  try {
    if (CURRENT === 'action') m.innerHTML = await renderActionCenter();
    else if (CURRENT === 'drill') m.innerHTML = await renderDrill();
    else if (CURRENT === 'trends') m.innerHTML = await renderTrends();
    else if (CURRENT === 'stock') m.innerHTML = await renderStock();
    else if (CURRENT === 'accuracy') m.innerHTML = await renderAccuracy();
    else if (CURRENT === 'sync') m.innerHTML = await renderSync();
    else if (CURRENT === 'settings') m.innerHTML = await renderSettings();
    else if (CURRENT === 'users') m.innerHTML = await renderUsers();
    wireDynamic();
  } catch (e) {
    m.innerHTML = `<div class="card"><p class="hint">تعذّر تحميل البيانات: ${esc(e.message)}</p></div>`;
  }
}

/* ---------- مركز إجراءات اليوم ---------- */
function reasonText(g, type) { return g.reason; }
function signalNote(g) {
  if (!g.signal) return '';
  const s = g.signal;
  const label = s.kind === 'reserved' ? '✅ طلب فعلاً (مؤكد) — فاتورة محجوزة بانتظار التسليم' : '🔵 طلب فعلاً (مبدئي) — عرض سعر مفتوح';
  const bg = s.kind === 'reserved' ? 'var(--greenbg)' : '#eaf2fc';
  const fg = s.kind === 'reserved' ? 'var(--green)' : 'var(--blue)';
  return `<div class="reason" style="background:${bg};color:${fg}">${label} بتاريخ ${fmtDate(s.date)}، كمية ${fmtN(s.qty, 0)}.</div>`;
}
function alertCard(g, type, color) {
  return `<div class="alert-card">
    <div class="alert-head">
      <div class="alert-title">${esc(g.cust_name || g.cust_code)} <span class="hint">(${esc(g.cust_code)})</span> — ${esc(g.item_name || g.item_code)}</div>
      <span class="badge b-${color}">${g.confidence != null ? g.confidence + '% ثقة' : ''}</span>
    </div>
    <div class="alert-grid">
      <div><b>آخر سحب</b>${fmtDate(g.last_wd_date)}</div>
      <div><b>التاريخ المتوقع</b>${g.expected_date ? fmtDate(g.expected_date) : '—'}</div>
      <div><b>الكمية المتوقعة</b>${fmtN(g.expected_qty, 0)} ${esc(g.uom || '')}</div>
      <div><b>النطاق المتوقع</b>${fmtN(g.qty_low, 0)}–${fmtN(g.qty_high, 0)}</div>
      <div><b>متوسط الفترة</b>${fmtN(g.median_interval, 1)} يوم عمل</div>
      <div><b>أيام منذ آخر سحب</b>${g.days_since_last}</div>
      <div><b>المندوب</b>${esc(g.rep || '—')}</div>
      <div><b>تصنيف العميل</b>${esc(g.cust_category || '—')}</div>
    </div>
    <div class="reason">📌 ${esc(g.reason)}</div>
    ${signalNote(g)}
    <div class="rec">✅ ${esc(g.recommendedAction)}</div>
    <div class="actions">
      <button class="btn sm" onclick="doAction('${g.cust_code}','${g.item_code}','${type}','contacted')">تم التواصل</button>
      <button class="btn ghost sm" onclick="doAction('${g.cust_code}','${g.item_code}','${type}','snoozed',3)">تأجيل 3 أيام عمل</button>
      <button class="btn ghost sm" onclick="doAction('${g.cust_code}','${g.item_code}','${type}','done')">إغلاق نهائي</button>
    </div>
  </div>`;
}
async function doAction(custCode, itemCode, alertType, status, snoozeDays) {
  await apiPost('/action-center/action', { custCode, itemCode, alertType, status, snoozeDays });
  render();
}
let ACTION_META = null;
async function renderActionCenter() {
  const qs = new URLSearchParams();
  if (ACTION_FILTERS.rep) qs.set('rep', ACTION_FILTERS.rep);
  if (ACTION_FILTERS.ccat) qs.set('custCategory', ACTION_FILTERS.ccat);
  if (ACTION_FILTERS.icat) qs.set('itemCategory', ACTION_FILTERS.icat);
  if (ACTION_FILTERS.q) qs.set('q', ACTION_FILTERS.q);
  if (ACTION_FILTERS.minConf) qs.set('minConf', ACTION_FILTERS.minConf);
  const [data, meta] = await Promise.all([apiGet('/action-center?' + qs.toString()), apiGet('/action-center/meta')]);
  ACTION_META = meta;
  window._LAST_ACTION_DATA = data;
  const b = data.buckets;
  if (!data.total && !b.dueNow.length) {
    // لا يوجد بيانات إطلاقاً بعد
  }
  const sections = [
    ['dueNow', '🔴 يحتاج إجراء الآن', 'red'],
    ['due3', '🟠 خلال 3 أيام عمل', 'orange'],
    ['due7', '🟡 خلال أسبوع', 'yellow'],
    ['missed', '🔴 Missed — لم يسحب رغم التوقع', 'red'],
    ['anomaly', '🔴 Anomalies — كمية غير معتادة', 'red'],
    ['growth', '🟢 Demand Growth — طلب في تصاعد', 'green'],
  ];
  return `
  <div class="kpi">
    <div class="box"><b>${b.dueNow.length}</b>يحتاج إجراء الآن</div>
    <div class="box"><b>${b.due3.length}</b>خلال 3 أيام</div>
    <div class="box"><b>${b.due7.length}</b>خلال أسبوع</div>
    <div class="box"><b>${b.missed.length}</b>Missed</div>
    <div class="box"><b>${b.anomaly.length}</b>Anomalies</div>
    <div class="box"><b>${b.growth.length}</b>Demand Growth</div>
  </div>
  <div class="card">
    <div class="row">
      ${ME.role === 'admin' ? `<select id="fRep"><option value="">كل المندوبين</option>${meta.reps.map((r) => `<option ${ACTION_FILTERS.rep === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>` : ''}
      <select id="fCcat"><option value="">كل تصنيفات العملاء</option>${meta.custCategories.map((r) => `<option ${ACTION_FILTERS.ccat === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <select id="fIcat"><option value="">كل فئات الأصناف</option>${meta.itemCategories.map((r) => `<option ${ACTION_FILTERS.icat === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      <input type="text" id="fQ" placeholder="بحث عميل/صنف" value="${esc(ACTION_FILTERS.q)}">
      <label>حد أدنى للثقة</label><input type="number" id="fConf" value="${ACTION_FILTERS.minConf}" style="width:60px">
      <button class="btn sm" onclick="applyActionFilters()">تطبيق</button>
      <button class="btn ghost sm" onclick="exportActionCsv()">تصدير CSV</button>
    </div>
    ${data.insufficientCount ? `<p class="hint">${data.insufficientCount} زوج (عميل×صنف) لديه بيانات غير كافية للتوقع — غير مُدرج في التنبيهات.</p>` : ''}
    ${!data.total ? '<p class="hint">لا توجد بيانات بعد. من تبويب "🔄 استيراد ومزامنة" (Admin) تحقق من مجلدات data/incoming، أو انتظر أول Push من GitHub Desktop.</p>' : ''}
  </div>
  ${sections.map(([key, title, color]) => {
    const list = b[key];
    return `<div class="card section-${color}"><h2>${title} <span class="badge b-${color}">${list.length}</span></h2>${list.length ? list.map((g) => alertCard(g, key, color)).join('') : '<div class="empty">لا يوجد عناصر في هذا القسم حالياً.</div>'}</div>`;
  }).join('')}
  `;
}
function applyActionFilters() {
  const repEl = document.getElementById('fRep');
  ACTION_FILTERS.rep = repEl ? repEl.value : '';
  ACTION_FILTERS.ccat = document.getElementById('fCcat').value;
  ACTION_FILTERS.icat = document.getElementById('fIcat').value;
  ACTION_FILTERS.q = document.getElementById('fQ').value;
  ACTION_FILTERS.minConf = +document.getElementById('fConf').value || 0;
  render();
}
function exportActionCsv() {
  const data = window._LAST_ACTION_DATA;
  if (!data) return;
  const all = [...data.buckets.dueNow, ...data.buckets.due3, ...data.buckets.due7, ...data.buckets.missed, ...data.buckets.anomaly, ...data.buckets.growth];
  let t = 'الحالة\tالعميل\tكود العميل\tالصنف\tآخر سحب\tالتاريخ المتوقع\tالكمية المتوقعة\tالنطاق\tالثقة\tمتوسط الفترة\tأيام منذ آخر سحب\tالمندوب\n';
  all.forEach((g) => { t += [g.status, g.cust_name, g.cust_code, g.item_name, g.last_wd_date, g.expected_date || '', fmtN(g.expected_qty, 0), fmtN(g.qty_low, 0) + '-' + fmtN(g.qty_high, 0), g.confidence, fmtN(g.median_interval, 1), g.days_since_last, g.rep].join('\t') + '\n'; });
  downloadFile('مركز_إجراءات_اليوم.csv', '﻿' + t);
}
function downloadFile(name, content, type) {
  const b = new Blob([content], { type: type || 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
}

/* ---------- تحليل عميل×صنف ---------- */
async function renderDrill() {
  const list = await apiGet('/drill/list');
  if (!list.length) return '<div class="card"><h2>لا توجد بيانات بعد</h2></div>';
  if (!DRILL_KEY || !list.some((x) => x.cust_code + '||' + x.item_code === DRILL_KEY)) DRILL_KEY = list[0].cust_code + '||' + list[0].item_code;
  const [cc, ic] = DRILL_KEY.split('||');
  const { forecast: g, history } = await apiGet(`/drill/${encodeURIComponent(cc)}/${encodeURIComponent(ic)}`);
  const maxQ = Math.max(...history.map((e) => e.qty), 1);
  const spark = history.map((e) => `<div title="${fmtDate(e.date)}: ${fmtN(e.qty, 0)}" style="display:inline-block;width:14px;height:${10 + 70 * (e.qty / maxQ)}px;background:var(--blue);margin-inline-end:3px;vertical-align:bottom;border-radius:2px 2px 0 0"></div>`).join('');
  return `
  <div class="card">
    <h2>اختر عميل × صنف</h2>
    <select id="drillSel" onchange="DRILL_KEY=this.value;render()">${list.map((x) => { const k = x.cust_code + '||' + x.item_code; return `<option value="${k}" ${k === DRILL_KEY ? 'selected' : ''}>${esc(x.cust_name)} — ${esc(x.item_name)}</option>`; }).join('')}</select>
  </div>
  <div class="card">
    <h2>${esc(g.cust_name)} (${esc(g.cust_code)}) — ${esc(g.item_name)} (${esc(g.item_code)})</h2>
    <div class="alert-grid">
      <div><b>عدد السحوبات</b>${g.n_obs}</div>
      <div><b>متوسط الفترة</b>${fmtN(g.avg_interval, 1)} يوم عمل</div>
      <div><b>وسيط الفترة</b>${fmtN(g.median_interval, 1)} يوم عمل</div>
      <div><b>معامل تذبذب الفترة</b>${g.cv_interval != null ? fmtN(g.cv_interval * 100, 0) + '%' : '—'}</div>
      <div><b>متوسط الكمية</b>${fmtN(g.avg_qty, 0)}</div>
      <div><b>وسيط الكمية</b>${fmtN(g.median_qty, 0)}</div>
      <div><b>الاتجاه Trend</b>${g.trend === 'up' ? '📈 صاعد' : g.trend === 'down' ? '📉 هابط' : '➖ مستقر'}</div>
      <div><b>الموسمية</b>${g.seasonal_ok ? 'يمكن رصدها (بيانات كافية)' : 'بيانات غير كافية'}</div>
      <div><b>اليوم الأكثر تكراراً</b>${g.dom_dow != null ? DOW_NAMES[g.dom_dow] + ' (' + fmtN(g.dom_pct * 100, 0) + '%)' : '—'}</div>
      <div><b>آخر سحب</b>${fmtDate(g.last_wd_date)}</div>
      <div><b>التاريخ المتوقع القادم</b>${g.expected_date ? fmtDate(g.expected_date) : '—'}</div>
      <div><b>الكمية المتوقعة</b>${fmtN(g.expected_qty, 0)} (${fmtN(g.qty_low, 0)}–${fmtN(g.qty_high, 0)})</div>
      <div><b>الثقة</b>${g.confidence}%</div>
    </div>
    <h3>مخطط الكميات عبر الزمن</h3>
    <div style="border-bottom:1px solid var(--line);padding:6px 0">${spark || '—'}</div>
    <h3>سجل السحوبات</h3>
    <table><tr><th>التاريخ</th><th>يوم</th><th>الكمية</th><th>الفترة عن السابقة (يوم عمل)</th></tr>
    ${history.map((e) => `<tr><td>${fmtDate(e.date)}</td><td>${DOW_NAMES[new Date(e.date + 'T00:00:00Z').getUTCDay()]}</td><td class="num">${fmtN(e.qty, 0)}</td><td class="num">${e.intervalWD == null ? '—' : e.intervalWD}</td></tr>`).join('')}
    </table>
  </div>`;
}

/* ---------- اتجاهات الطلب ---------- */
async function renderTrends() {
  const { byItem, byRep } = await apiGet('/trends');
  if (!byItem.length) return '<div class="card"><h2>لا توجد بيانات بعد</h2></div>';
  return `
  <div class="card">
    <h2>اتجاه الطلب حسب الصنف (مجمّع عبر كل العملاء)</h2>
    <table><tr><th>الصنف</th><th>عدد العملاء</th><th>إجمالي الكمية التاريخية</th><th>مؤشر الاتجاه</th></tr>
    ${byItem.map((r) => `<tr><td>${esc(r.item_name || r.item_code)}</td><td class="num">${r.customers}</td><td class="num">${fmtN(r.total_qty, 0)}</td><td class="num">${r.total_slope > 0.15 ? '📈 صاعد' : r.total_slope < -0.15 ? '📉 هابط' : '➖ مستقر'} (${(r.total_slope * 100).toFixed(0)}%)</td></tr>`).join('')}
    </table>
  </div>
  <div class="card">
    <h2>ملخص حسب المندوب</h2>
    <table><tr><th>المندوب</th><th>عدد الأزواج (عميل×صنف)</th><th>يحتاج إجراء الآن</th><th>Missed</th><th>Demand Growth</th></tr>
    ${byRep.map((r) => `<tr><td>${esc(r.rep)}</td><td class="num">${r.pairs}</td><td class="num">${r.due_now}</td><td class="num">${r.missed}</td><td class="num">${r.growth}</td></tr>`).join('')}
    </table>
  </div>`;
}

/* ---------- المخزون التقديري ---------- */
async function renderStock() {
  const rows = await apiGet('/stock');
  if (!rows.length) return '<div class="card"><h2>لا توجد بيانات بعد</h2></div>';
  return `
  <div class="card">
    <h2>المخزون التقديري لدى العميل</h2>
    <p class="hint">يُحسب فقط للأزواج التي تتوفر لها بيانات رصيد افتتاحي فعلية (ملفات data/incoming/stock). أي زوج بدونها يظهر "غير معروف".</p>
    <table><tr><th>العميل</th><th>الصنف</th><th>الرصيد التقديري</th><th>نقطة إعادة الطلب</th><th>الوصول لإعادة الطلب</th><th>الكمية المقترحة</th></tr>
    ${rows.map((r) => r.known ? `<tr>
      <td>${esc(r.cust_name)}</td><td>${esc(r.item_name)}</td>
      <td class="num">${fmtN(r.est, 0)}</td>
      <td class="num">${fmtN(r.reorderPoint, 0)}</td>
      <td>${r.reorderDate ? (r.daysToReorder <= 0 ? '<span class="badge b-red">وصل الآن</span>' : 'خلال ' + r.daysToReorder + ' يوم عمل (' + fmtDate(r.reorderDate) + ')') : '—'}</td>
      <td class="num">${fmtN(r.expected_qty, 0)}</td>
    </tr>` : `<tr><td>${esc(r.cust_name)}</td><td>${esc(r.item_name)}</td><td colspan="4"><span class="badge b-gray">غير معروف — لا توجد بيانات مخزون لهذا الزوج</span></td></tr>`).join('')}
    </table>
  </div>`;
}

/* ---------- دقة التوقعات ---------- */
async function renderAccuracy() {
  const acc = await apiGet('/accuracy');
  const bt = LAST_BACKTEST;
  return `
  <div class="card">
    <h2>Backtest فوري</h2>
    <p class="hint">لكل زوج عميل×صنف لديه 4 سحوبات فأكثر: يُخفى آخر سحب، يُحسب التوقع من التاريخ السابق فقط، ثم يُقارن بالسحب الفعلي.</p>
    <button class="btn" onclick="runBacktestNow()">▶️ تشغيل Backtest الآن</button>
    ${bt ? `<div class="kpi" style="margin-top:10px">
      <div class="box"><b>${bt.count}</b>عدد الحالات المختبرة</div>
      <div class="box"><b>${fmtN(bt.mae, 1)}</b>MAE (أيام عمل)</div>
      <div class="box"><b>${bt.mape != null ? fmtN(bt.mape, 1) + '%' : '—'}</b>MAPE (كمية)</div>
    </div>
    <table><tr><th>العميل</th><th>الصنف</th><th>تاريخ متوقع</th><th>تاريخ فعلي</th><th>خطأ (يوم عمل)</th><th>كمية متوقعة</th><th>كمية فعلية</th><th>خطأ %</th></tr>
    ${bt.results.map((a) => `<tr><td>${esc(a.custName)}</td><td>${esc(a.itemName)}</td><td>${fmtDate(a.predictedDate)}</td><td>${fmtDate(a.actualDate)}</td><td class="num">${a.errDays}</td><td class="num">${fmtN(a.predictedQty, 0)}</td><td class="num">${fmtN(a.actualQty, 0)}</td><td class="num">${a.errQtyPct != null ? fmtN(a.errQtyPct, 0) + '%' : '—'}</td></tr>`).join('')}
    </table>` : ''}
  </div>
  <div class="card">
    <h2>الدقة المستمرة (Forecast vs Actual عبر الزمن)</h2>
    <div class="kpi">
      <div class="box"><b>${acc.count}</b>عدد المقارنات المسجّلة</div>
      <div class="box"><b>${fmtN(acc.mae, 1)}</b>MAE (أيام عمل)</div>
      <div class="box"><b>${acc.mape != null ? fmtN(acc.mape, 1) + '%' : '—'}</b>MAPE (كمية)</div>
    </div>
    ${acc.log.length ? `<table><tr><th>العميل</th><th>الصنف</th><th>تاريخ متوقع</th><th>تاريخ فعلي</th><th>خطأ (يوم عمل)</th><th>خطأ الكمية %</th></tr>
    ${acc.log.map((a) => `<tr><td>${esc(a.cust_name)}</td><td>${esc(a.item_name)}</td><td>${fmtDate(a.predicted_date)}</td><td>${fmtDate(a.actual_date)}</td><td class="num">${a.err_days}</td><td class="num">${a.err_qty_pct != null ? fmtN(a.err_qty_pct, 0) + '%' : '—'}</td></tr>`).join('')}
    </table>` : '<div class="empty">لا توجد مقارنات بعد — ستظهر تلقائياً عند وصول بيانات جديدة لاحقة لتوقعات محفوظة.</div>'}
  </div>`;
}
async function runBacktestNow() { LAST_BACKTEST = await apiPost('/accuracy/backtest'); render(); }

/* ---------- استيراد ومزامنة (Admin) ---------- */
async function renderSync() {
  const history = await apiGet('/sync/history');
  return `
  <div class="card">
    <h2>تغذية البيانات عبر GitHub</h2>
    <p class="hint">حط ملفات <b>.csv / .txt</b> (نفس ترتيب الأعمدة المعتاد) داخل المجلد المناسب — من جهازك عبر GitHub Desktop (Commit + Push). عند إعادة نشر Railway تلقائياً، يفحص السيرفر المجلدات ويستورد أي ملف جديد بدون تكرار. يكتشف تلقائياً عمود "#" اللي بيضيفه SAP B1 Query Generator أحياناً بأول الصفوف.</p>
    <p class="hint">
      <code>data/incoming/withdrawals/</code>: كود العميل، اسم العميل، كود الصنف، اسم الصنف، تاريخ السحب، يوم السحب (يُتجاهل)، الكمية، وحدة القياس، مندوب المبيعات، تصنيف العميل، فئة الصنف.<br>
      <code>data/incoming/quotes/</code>: كود العميل، اسم العميل، كود الصنف، اسم الصنف، تاريخ العرض، الكمية، الكمية المتبقية Open Qty، المندوب.<br>
      <code>data/incoming/reserved/</code>: رقم الفاتورة، تاريخ الفاتورة، كود العميل، اسم العميل، كود الصنف، اسم الصنف، إجمالي كمية الفاتورة، إجمالي قيمة الفاتورة، إجمالي كمية الديليفري، الكمية المرتجعة، الكمية غير المسلمة الفعلية.<br>
      <code>data/incoming/stock/</code> (اختياري): كود العميل، كود الصنف، النوع (Opening/Delivery)، التاريخ، الكمية.
    </p>
    <button class="btn" onclick="syncNow()">🔄 فحص المجلدات الآن يدوياً</button>
    <div id="syncMsg" class="hint"></div>
  </div>
  <div class="card">
    <h2>سجل الملفات المستوردة</h2>
    ${history.length ? `<table><tr><th>الملف</th><th>النوع</th><th>جديد</th><th>مكرر</th><th>غير صالح</th><th>تاريخ الاستيراد</th></tr>
    ${history.map((h) => `<tr><td>${esc(h.filename)}</td><td>${h.file_kind}</td><td class="num">${h.rows_added}</td><td class="num">${h.rows_dup}</td><td class="num">${h.rows_bad}</td><td>${new Date(h.imported_at).toLocaleString('ar')}</td></tr>`).join('')}
    </table>` : '<div class="empty">لا يوجد ملفات مستوردة بعد.</div>'}
  </div>`;
}
async function syncNow() {
  document.getElementById('syncMsg').textContent = 'جاري الفحص...';
  const r = await apiPost('/sync');
  const all = [...r.importResult.withdrawals, ...r.importResult.stock, ...r.importResult.quotes, ...r.importResult.reserved];
  const added = all.reduce((s, x) => s + (x.added || 0), 0);
  const bad = r.importResult.withdrawals.reduce((s, x) => s + (x.bad || 0), 0);
  document.getElementById('syncMsg').innerHTML = `تم: ${added} سطر جديد${bad ? `، ${bad} سطر مسحوبات غير صالح` : ''}، أُعيد حساب ${r.recomputeResult.pairs} زوج عميل×صنف.`;
  render();
}

/* ---------- الإعدادات (Admin) ---------- */
async function renderSettings() {
  const { settings, holidays } = await apiGet('/settings');
  return `
  <div class="card">
    <h2>أيام العطلة الأسبوعية</h2>
    <div class="row">${DOW_NAMES.map((n, i) => `<label><input type="checkbox" data-dow="${i}" ${(settings.offDays || []).includes(i) ? 'checked' : ''} onchange="toggleOffDay(${i},this.checked,${JSON.stringify(settings.offDays || [])})"> ${n}</label>`).join('')}</div>
  </div>
  <div class="card">
    <h2>العطل الرسمية</h2>
    <div class="row"><input type="date" id="holDate"><input type="text" id="holDesc" placeholder="وصف العطلة"><button class="btn sm" onclick="addHoliday()">إضافة</button></div>
    <div class="pill-list">${holidays.map((h) => `<span class="pill">${fmtDate(h.hol_date)} — ${esc(h.description || '')}<button onclick="removeHoliday('${h.hol_date}')">×</button></span>`).join('') || '<span class="hint">لا توجد عطل مضافة</span>'}</div>
  </div>
  <div class="card">
    <h2>عتبات التنبيهات والمحرك</h2>
    <div class="row">
      <label>مهلة سماح قبل اعتباره متأخراً (يوم عمل)</label><input type="number" id="setGrace" value="${settings.grace}" style="width:60px">
      <label>مضاعف اعتبار "Missed" (× متوسط الفترة)</label><input type="number" step="0.1" id="setMissMult" value="${settings.graceMissedMult}" style="width:60px">
      <label>مهلة التوريد Lead Time (يوم عمل)</label><input type="number" id="setLead" value="${settings.leadTimeDays}" style="width:60px">
      <label>عتبة اعتبار الطلب "صاعد/هابط" %</label><input type="number" step="1" id="setGrowth" value="${settings.growthThreshold * 100}" style="width:60px">
      <button class="btn sm" onclick="saveEngineSettings()">حفظ</button>
    </div>
    <p class="hint" id="setMsg"></p>
  </div>`;
}
async function toggleOffDay(dow, checked, cur) {
  const s = new Set(cur); if (checked) s.add(dow); else s.delete(dow);
  await apiPost('/settings', { offDays: [...s] }); render();
}
async function addHoliday() {
  const date = document.getElementById('holDate').value, description = document.getElementById('holDesc').value;
  if (!date) return alert('اختر تاريخاً');
  await apiPost('/settings/holidays', { date, description }); render();
}
async function removeHoliday(date) { await apiDelete('/settings/holidays/' + date); render(); }
async function saveEngineSettings() {
  await apiPost('/settings', {
    grace: +document.getElementById('setGrace').value || 0,
    graceMissedMult: +document.getElementById('setMissMult').value || 1.5,
    leadTimeDays: +document.getElementById('setLead').value || 3,
    growthThreshold: (+document.getElementById('setGrowth').value || 15) / 100,
  });
  document.getElementById('setMsg').textContent = 'تم الحفظ وإعادة الحساب.';
}

/* ---------- المستخدمون (Admin) ---------- */
async function renderUsers() {
  const [users, reps] = await Promise.all([apiGet('/users'), apiGet('/users/reps')]);
  return `
  <div class="card">
    <h2>إضافة مستخدم</h2>
    <div class="row">
      <input type="text" id="nuUser" placeholder="اسم المستخدم">
      <input type="password" id="nuPass" placeholder="كلمة المرور">
      <select id="nuRole" onchange="document.getElementById('nuRepWrap').style.display=this.value==='rep'?'':'none'"><option value="rep">مندوب</option><option value="admin">Admin</option></select>
      <span id="nuRepWrap"><select id="nuRep"><option value="">اختر المندوب</option>${reps.map((r) => `<option>${esc(r)}</option>`).join('')}</select></span>
      <button class="btn sm" onclick="createUser()">إضافة</button>
    </div>
    <p class="hint">اسم المندوب هنا يجب أن يطابق تماماً اسم المندوب كما ورد في عمود "مندوب المبيعات" بملفات الاستيراد، حتى يشوف بياناته فقط.</p>
    <p class="hint" id="nuMsg"></p>
  </div>
  <div class="card">
    <h2>المستخدمون الحاليون</h2>
    <table><tr><th>اسم المستخدم</th><th>الصلاحية</th><th>المندوب المرتبط</th><th>مفعّل</th><th></th></tr>
    ${users.map((u) => `<tr><td>${esc(u.username)}</td><td>${u.role}</td><td>${esc(u.rep_name || '—')}</td><td>${u.active ? '✅' : '❌'}</td>
      <td><button class="btn ghost sm" onclick="toggleUserActive(${u.id},${!u.active})">${u.active ? 'تعطيل' : 'تفعيل'}</button></td></tr>`).join('')}
    </table>
  </div>`;
}
async function createUser() {
  const username = document.getElementById('nuUser').value.trim();
  const password = document.getElementById('nuPass').value;
  const role = document.getElementById('nuRole').value;
  const repName = document.getElementById('nuRep').value;
  try {
    await apiPost('/users', { username, password, role, repName });
    render();
  } catch (e) { document.getElementById('nuMsg').textContent = e.message; }
}
async function toggleUserActive(id, active) { await apiPatch('/users/' + id, { active }); render(); }

function wireDynamic() {}

document.getElementById('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
boot();
