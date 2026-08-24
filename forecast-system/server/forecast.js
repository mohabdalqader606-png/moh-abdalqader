const { addWorkingDays, workingDaysBetween } = require('./workdays');

function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
}
function mad(a) {
  if (!a.length) return 0;
  const m = median(a);
  return median(a.map((x) => Math.abs(x - m)));
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function linSlope(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const xs = arr.map((_, i) => i);
  const mx = mean(xs), my = mean(arr);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (arr[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num / den : 0;
}
function ewma(arr, alpha) {
  if (!arr.length) return null;
  let s = arr[0];
  for (let i = 1; i < arr.length; i++) s = alpha * arr[i] + (1 - alpha) * s;
  return s;
}

// events: [{date:'YYYY-MM-DD', qty:Number}] مرتبة تصاعدياً لنفس (عميل×صنف)
// cal: من workdays.makeCalendar
// settings: {grace, graceMissedMult, alphaInterval, alphaQty, growthThreshold}
function analyzeGroup(events, today, cal, settings) {
  const n = events.length;
  const qtyArr = events.map((e) => e.qty);
  const intervals = [];
  for (let i = 1; i < n; i++) intervals.push(workingDaysBetween(events[i - 1].date, events[i].date, cal));
  const last = events[n - 1];
  const avgInt = mean(intervals), medInt = median(intervals), sdInt = stdev(intervals);
  const cvInt = avgInt ? sdInt / avgInt : null;
  const avgQty = mean(qtyArr), medQty = median(qtyArr), sdQty = stdev(qtyArr), madQty = mad(qtyArr);
  const cvQty = avgQty ? sdQty / avgQty : null;
  const slopeQty = linSlope(qtyArr);
  const relSlope = avgQty ? (slopeQty * n) / avgQty : 0;
  const trend = relSlope > settings.growthThreshold ? 'up' : relSlope < -settings.growthThreshold ? 'down' : 'flat';

  const wdCount = {};
  events.forEach((e) => { const dow = new Date(e.date + 'T00:00:00Z').getUTCDay(); wdCount[dow] = (wdCount[dow] || 0) + 1; });
  let domDow = null, domPct = 0;
  Object.entries(wdCount).forEach(([k, v]) => { const pct = v / n; if (pct > domPct) { domPct = pct; domDow = +k; } });
  const seasonalOk = n >= 12;

  const daysSinceLast = workingDaysBetween(last.date, today, cal);
  let expInt = null, expDate = null;
  if (n >= 2) { expInt = ewma(intervals, settings.alphaInterval); expDate = addWorkingDays(last.date, expInt, cal); }
  let expQty = null, qtyLow = null, qtyHigh = null;
  if (n >= 1) {
    expQty = ewma(qtyArr, settings.alphaQty);
    expQty = Math.max(0, expQty + (n >= 2 ? slopeQty : 0));
    const spread = madQty ? madQty * 1.4826 * 1.2 : expQty * 0.12;
    qtyLow = Math.max(0, expQty - spread); qtyHigh = expQty + spread;
  }
  let confidence = n >= 1 ? 15 : 0;
  if (n >= 2) {
    const nScore = Math.min(n, 10) / 10 * 100;
    const regScore = cvInt != null ? clamp((1 - cvInt) * 100, 0, 100) : 30;
    const qtyRegScore = cvQty != null ? clamp((1 - cvQty) * 100, 0, 100) : 30;
    let recencyScore = 100;
    if (expInt) { const ratio = expInt ? daysSinceLast / expInt : 1; recencyScore = ratio <= 1.2 ? 100 : clamp(100 - (ratio - 1.2) * 60, 10, 100); }
    confidence = Math.round(0.35 * nScore + 0.30 * regScore + 0.15 * qtyRegScore + 0.20 * recencyScore);
    if (n < 3) confidence = Math.min(confidence, 40);
    confidence = clamp(confidence, 5, 99);
  }
  let anomaly = null;
  if (n >= 4 && madQty > 0) {
    const z = (last.qty - medQty) / (madQty * 1.4826);
    if (Math.abs(z) > 2) anomaly = { z: +z.toFixed(2), dir: z > 0 ? 'high' : 'low' };
  }
  let overdueWD = expDate ? workingDaysBetween(expDate, today, cal) : null;
  let status = 'future';
  if (n < 2) status = 'insufficient';
  else if (overdueWD != null) {
    const missThresh = (medInt || avgInt || 1) * settings.graceMissedMult;
    if (overdueWD > missThresh) status = 'missed';
    else if (overdueWD >= settings.grace) status = 'dueNow';
    else if (overdueWD >= -3) status = 'due3';
    else if (overdueWD >= -7) status = 'due7';
    else status = 'future';
  }
  return {
    n, avgInt, medInt, sdInt, cvInt, avgQty, medQty, sdQty, madQty, cvQty, slopeQty, relSlope, trend,
    domDow, domPct, seasonalOk, last, daysSinceLast, expInt, expDate, expQty, qtyLow, qtyHigh, confidence,
    anomaly, overdueWD, status,
  };
}

function groupByPair(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const key = r.cust_code + '||' + r.item_code;
    if (!map.has(key)) {
      map.set(key, {
        custCode: r.cust_code, itemCode: r.item_code, custName: r.cust_name, itemName: r.item_name,
        rep: '', custCategory: '', itemCategory: '', uom: '', events: [],
      });
    }
    const g = map.get(key);
    g.events.push({ date: r.wd_date, qty: +r.qty });
    if (r.rep) g.rep = r.rep;
    if (r.cust_category) g.custCategory = r.cust_category;
    if (r.item_category) g.itemCategory = r.item_category;
    if (r.uom) g.uom = r.uom;
    if (r.cust_name) g.custName = r.cust_name;
    if (r.item_name) g.itemName = r.item_name;
  });
  map.forEach((g) => g.events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
  return map;
}

module.exports = { analyzeGroup, groupByPair, mean, median, stdev, mad, linSlope, ewma, clamp };
