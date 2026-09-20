/* PERMANENT regression suite — Foreign Procurement Intelligence screen.
   Committed to the repository (tests/procurement-intelligence/). Not loaded by the application at runtime.

   RECOVERY NOTE (Phase P0-A): this file is a direct, faithful port of the 84-check business-logic suite
   that ran repeatedly throughout this engagement from a session-local scratch directory (never committed).
   The scratch file still existed at port time — every suite, assertion and comment below is recovered
   verbatim from it, not reconstructed from memory. See RECOVERY.md for the full accounting.

   Categories exercised per suite (used by run-all.js for coverage reporting — not code coverage):
     unit / business-rule / integration / regression / data-validation / decision-state
   Suite → category → Control-Matrix mapping lives in TRACEABILITY.md. */
'use strict';
const { launchBrowser, freshPage, authPage, L, near } = require('./harness');

const SUITE_META = {
  1: { title: 'IN-TRANSIT RULE', category: 'business-rule' },
  2: { title: 'COMPLETE PURCHASE ORDER — supplier aggregation', category: 'integration' },
  3: { title: 'SALES ACCOUNTING — no double counting', category: 'business-rule' },
  4: { title: 'SPECIAL WAREHOUSES', category: 'business-rule' },
  5: { title: 'MONTHLY SALES — partial period', category: 'business-rule' },
  6: { title: 'STOCKOUT / OUTLIER DEMAND ADJUSTMENT', category: 'business-rule' },
  7: { title: 'CUSTOMER DRILL-DOWN sorting', category: 'unit' },
  8: { title: 'DATA UPLOAD LIFECYCLE — baseline lock + incremental', category: 'integration' },
  9: { title: 'PERFORMANCE — representative dataset', category: 'regression' },
  10: { title: 'PHASE 2 — SAP REALITY ALIGNMENT', category: 'regression' },
  11: { title: 'PILOT REVIEW', category: 'integration' },
  12: { title: 'LOGIN / PERMISSIONS GATE', category: 'data-validation' },
};

const R = []; let errorsAll = [];
const ONLY = (process.argv[2] || '').split(',').filter(Boolean).map(Number);
const run = n => !ONLY.length || ONLY.includes(n);
const counters = {};
function check(suite, name, ok, info) {
  counters[suite] = (counters[suite] || 0) + 1;
  const id = 'BL-' + String(suite).padStart(2, '0') + '.' + counters[suite];
  R.push({ id, suite, category: SUITE_META[suite].category, name, ok: !!ok, info });
  console.log((ok ? '  PASS' : '  FAIL') + ' - ' + id + ' ' + name + (info !== undefined ? '  [' + info + ']' : ''));
}

function salesHeader() { return "DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tاسم الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tالمبلغ\tملغى"; }
function saleRow(de, date, item, qty, whs, cust, name, amt, canc) { return `${de}\t0\t${date}\t${item}\t${item}\t${qty}\t${whs || '01'}\t${cust || 'C1'}\t${name || 'عميل'}\t${amt || qty * 5}\t${canc || 'N'}`; }

async function main() {
  const browser = await launchBrowser();
  const fresh = b => freshPage(b); // ADMIN, auto-session, empty IndexedDB — same defaults as the original `fresh()`

  /* ================= 1) IN-TRANSIT RULE ================= */
  console.log('\n[1] ' + SUITE_META[1].title);
  if (run(1)) { const { ctx, page } = await fresh(browser);
    await page.imp('suppliers', L(["رمز المورد\tاسم المورد\tالبلد\tمدة التوريد", "S1\tمورد\tTR\t30"]));
    await page.imp('inventory', L(["رمز الصنف\tالمستودع\tالرصيد الحالي", "FUT\t01\t10", "PAST\t01\t10", "APPR\t01\t10"]));
    await page.imp('purchaseOrders', L(["DocEntry\tLineNum\tتاريخ الأمر\tتاريخ التسليم\tرمز الصنف\tرمز المورد\tالكمية\tالمتبقي\tالحالة",
      "1\t0\t2026-08-01\t2026-10-15\tFUT\tS1\t2000\t2000\tO", "2\t0\t2026-06-01\t2026-07-15\tPAST\tS1\t2000\t2000\tO", "3\t0\t2026-06-01\t2026-07-15\tAPPR\tS1\t2000\t2000\tO"]));
    const s = [salesHeader()]; let de = 100;
    ['2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10'].forEach(d => ['FUT', 'PAST', 'APPR'].forEach(it => s.push(saleRow(de++, d, it, 400))));
    await page.imp('salesInvoices', s.join('\n'));
    await page.refresh();
    await page.evaluate(() => setDocOverride('PO_3_0', { treatAsInTransit: true, expectedArrival: '2026-09-28' }));
    await page.evaluate(() => { invalidateData(); STATE._recos = null; STATE._recosAll = null; });
    const r = await page.evaluate(() => ['FUT', 'PAST', 'APPR'].map(c => { const x = RECO.computeForItem(c); return { c, st: x.status, inc: x.incoming, unc: x.unconfirmedIncoming, qty: x.recommendedQty }; }));
    console.log('   ', JSON.stringify(r));
    check(1, 'Open PO + future date = confirmed incoming → IN_TRANSIT, qty 0', r[0].st === 'IN_TRANSIT' && r[0].inc === 2000 && r[0].unc === 0 && r[0].qty === 0);
    check(1, 'Open PO + past date + NO arrival = unconfirmed (not incoming) → CRITICAL with qty', r[1].st === 'CRITICAL' && r[1].inc === 0 && r[1].unc === 2000 && r[1].qty > 0);
    check(1, 'Open PO + past date + approved arrival = confirmed incoming → IN_TRANSIT', r[2].st === 'IN_TRANSIT' && r[2].inc === 2000 && r[2].unc === 0);
    await page.evaluate(() => { switchView('decisions'); });
    const cellTxt = await page.evaluate(() => document.getElementById('decisionsTable').innerText);
    check(1, 'UI shows "غير مؤكد" marker for unconfirmed incoming', cellTxt.includes('غير مؤكد'));
    await page.evaluate(() => openWhyDrawer('PAST'));
    const why = await page.$eval('#modalBox', e => e.innerText);
    check(1, 'Why drawer names unconfirmed expected goods needing arrival date', why.includes('غير مؤكدة') && why.includes('تاريخ وصول'));
    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 2) COMPLETE PURCHASE ORDER (20 TON) ================= */
  console.log('\n[2] ' + SUITE_META[2].title);
  if (run(2)) { const { ctx, page } = await fresh(browser);
    await page.imp('suppliers', L(["رمز المورد\tاسم المورد\tالبلد\tمدة التوريد", "SA\tSupplier A\tTR\t30"]));
    await page.imp('items', L(["رمز الصنف\tاسم الصنف\tوحدة القياس\tوزن الوحدة", "A\tItem A\tكغ\t1", "B\tItem B\tكغ\t1", "C\tItem C\tكغ\t1", "D\tItem D\tكغ\t1"]));
    await page.imp('inventory', L(["رمز الصنف\tالمستودع\tالرصيد الحالي", "A\t01\t0", "B\t01\t0", "C\t01\t0", "D\t01\t0"]));
    const pi = ["DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tرمز المورد\tالمورد\tالكمية"]; let n = 1;
    [['A', 5000], ['A', 5000], ['B', 2000], ['B', 2000], ['C', 3000], ['C', 3000], ['D', 5000], ['D', 5000]].forEach(([it, q], i) => pi.push(`${n++}\t0\t2025-0${(i % 6) + 1}-15\t${it}\tSA\tSupplier A\t${q}`));
    await page.imp('purchaseInvoices', pi.join('\n'));
    const s = [salesHeader()]; let de = 100; const dem = { A: 3700, B: 3000, C: 4500, D: 3800 };
    ['2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10'].forEach(d => Object.keys(dem).forEach(it => s.push(saleRow(de++, d, it, dem[it]))));
    await page.imp('salesInvoices', s.join('\n'));
    await page.refresh();
    const r = await page.evaluate(() => ['A', 'B', 'C', 'D'].map(c => { const x = RECO.computeForItem(c); return { c, need: Math.round(x.neededQtyRaw), qty: x.recommendedQty, st: x.status, pat: x.pattern && x.pattern.mostCommon, max: x.pattern && x.pattern.max }; }));
    console.log('   item-level:', JSON.stringify(r));
    check(2, 'Every recommended qty ≥ true requirement (pattern never caps)', r.every(x => x.qty >= x.need));
    check(2, 'Item C true need 5,470 > historical max 3,000 → recommended 6,000 (not 3,000)', r[2].need > r[2].max && r[2].qty === 6000, `need=${r[2].need} max=${r[2].max} qty=${r[2].qty}`);
    check(2, 'Item A rounded to practical multiple 5,000', r[0].qty === 5000);
    const plan = await page.evaluate(() => { const g = RECO.supplierPurchasePlan(['CRITICAL', 'ORDER_SOON']); return g.map(x => ({ s: x.supplierName, total: x.totalQty, items: x.items.map(i => i.ItemCode + '=' + i.recommendedQty) })); });
    console.log('   supplier-level:', JSON.stringify(plan));
    check(2, 'Supplier A aggregated = ONE order of 20,000 kg (20 Ton), 4 items', plan.length === 1 && plan[0].total === 20000 && plan[0].items.length === 4, JSON.stringify(plan[0]));
    await page.evaluate(() => { switchView('plan'); buildSupplierPlan(true); });
    const ui = await page.$eval('#planGroups', e => e.innerText);
    check(2, 'UI plan shows total 20,000 and ≈ 20.00 طن for Supplier A', ui.includes('20,000') && ui.includes('20.00 طن'));
    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 3) SALES ACCOUNTING ================= */
  console.log('\n[3] ' + SUITE_META[3].title);
  if (run(3)) { const { ctx, page } = await fresh(browser);
    const s = [salesHeader(),
      saleRow(1, '2026-05-03', 'X', 100, '01', 'C1', 'عميل1'),
      saleRow(2, '2026-05-10', 'X', 50, '01', 'C1', 'عميل1'),
      saleRow(3, '2026-05-12', 'X', 70, '01', 'C2', 'عميل2'),
      saleRow(4, '2026-05-15', 'X', 999, '01', 'C1', 'عميل1', 1, 'Y'),
      saleRow(5, '2026-05-15', 'X', 999, '01', 'C1', 'عميل1', 1, 'Y'),
    ];
    await page.imp('salesInvoices', s.join('\n'));
    const rt = ["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tالمبلغ\tملغى",
      "10\t0\t2026-05-20\tX\t20\t01\tC1\tعميل1\t100\tN",
      "11\t0\t2026-05-22\tX\t10\t01\tC1\tعميل1\t50\tN",
      "12\t0\t2026-05-25\tX\t500\t01\tC2\tعميل2\t1\tY",
    ];
    await page.imp('salesReturns', rt.join('\n'));
    await page.refresh();
    const res = await page.evaluate(() => { STATE.filters.dateFrom = '2026-05-01'; STATE.filters.dateTo = '2026-05-31'; refreshComputed(); const rep = getSalesReport(); const r = rep.rows.find(x => x.ItemCode === 'X'); const m = r.monthly.get('2026-05'); const dd = customerDrilldownRows('X', '2026-05'); return { net: m.qty, amt: m.amount, dd: dd.rows.map(c => c.code + ':' + c.qty), gross: SALES.buildNetLines().filter(l => l.qty > 0).reduce((a, l) => a + l.qty, 0), ret: -SALES.buildNetLines().filter(l => l.qty < 0).reduce((a, l) => a + l.qty, 0) }; });
    console.log('   ', JSON.stringify(res));
    check(3, 'Gross valid sales = 220 (cancelled invoice + cancellation doc ignored)', res.gross === 220);
    check(3, 'Valid returns = 30 (cancelled return ignored, not treated as sale)', res.ret === 30);
    check(3, 'Net = 220 − 30 = 190 (same item/customer/month aggregated, no double count)', res.net === 190);
    check(3, 'Drill-down per customer: C1 = 100+50−20−10 = 120, C2 = 70', res.dd.includes('C1:120') && res.dd.includes('C2:70'), res.dd.join(','));
    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 4) SPECIAL WAREHOUSES ================= */
  console.log('\n[4] ' + SUITE_META[4].title);
  if (run(4)) { const { ctx, page } = await fresh(browser);
    const inv = ["رمز الصنف\tالمستودع\tالرصيد الحالي"]; ['01', '004', '100', '006', '003', '005', '008', '011'].forEach(w => inv.push(`W\t${w}\t100`));
    await page.imp('inventory', inv.join('\n'));
    const s = [salesHeader()]; let de = 1;
    ['2026-06-10', '2026-07-10', '2026-08-10'].forEach(d => { s.push(saleRow(de++, d, 'W', 300, '01', 'C1', 'عميل')); s.push(saleRow(de++, d, 'W', 100, '011', 'MIL', 'المؤسسة العسكرية')); s.push(saleRow(de++, d, 'W', 50, '004', 'C1', 'عميل')); });
    await page.imp('salesInvoices', s.join('\n'));
    await page.refresh();
    const r = await page.evaluate(() => { const x = RECO.computeForItem('W'); const rep = getSalesReport(); const row = rep.rows.find(y => y.ItemCode === 'W'); const dd = customerDrilldownRows('W', '2026-07'); const series = DEMAND.monthlySeries('W'); return { physical: x.physical, available: x.available, demandMonth: series[series.length - 1].qty, salesJul: row.monthly.get('2026-07').qty, dd: dd.rows.map(c => c.code + ':' + c.qty) }; });
    console.log('   ', JSON.stringify(r));
    check(4, 'Physical = 800 (all 8 warehouses)', r.physical === 800);
    check(4, 'Available = 100 (only whs 01; 004/100/006/003/005/008/011 excluded)', r.available === 100);
    check(4, '011 sales INCLUDED in demand (300+100=400), 004 excluded', r.demandMonth === 400);
    check(4, '011 sales do NOT disappear from Sales Analysis (raw report shows all warehouses)', r.salesJul === 450 && r.dd.includes('MIL:100'));
    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 5) MONTHLY SALES — partial period ================= */
  console.log('\n[5] ' + SUITE_META[5].title);
  if (run(5)) { const { ctx, page } = await fresh(browser);
    const s = [salesHeader()]; let de = 1;
    for (let m = 1; m <= 9; m++) s.push(saleRow(de++, `2026-${String(m).padStart(2, '0')}-05`, 'M', 100));
    s.push(saleRow(de++, '2026-09-20', 'M', 999));
    await page.imp('salesInvoices', s.join('\n'));
    await page.refresh();
    const r = await page.evaluate(() => { STATE.filters.dateFrom = '2026-01-01'; STATE.filters.dateTo = '2026-09-13'; refreshComputed(); const rep = getSalesReport(); const row = rep.rows[0]; return { months: rep.months, days: rep.days, eq: rep.equivMonths, total: row.totalQty, avg: row.rawAvgQty, sep: row.monthly.get('2026-09').qty }; });
    console.log('   ', JSON.stringify(r));
    check(5, 'Months are Jan..Sep 2026 (9 columns)', r.months.length === 9 && r.months[0] === '2026-01' && r.months[8] === '2026-09');
    check(5, 'Actual days = 256 (8 months + 13 days), equivalent months ≈ 8.41', r.days === 256 && near(r.eq, 256 / 30.4368, 0.001), `${r.days} / ${r.eq.toFixed(3)}`);
    check(5, 'Sale after 13/9 excluded; September partial = 100', r.sep === 100 && r.total === 900);
    check(5, 'Average = 900/8.41 = 107.0 (NOT 900/9 = 100)', near(r.avg, 900 / (256 / 30.4368), 0.01) && !near(r.avg, 100, 0.5), r.avg.toFixed(2));
    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 6) STOCKOUT / OUTLIER ================= */
  console.log('\n[6] ' + SUITE_META[6].title);
  if (run(6)) { const { ctx, page } = await fresh(browser);
    await page.imp('inventory', L(["رمز الصنف\tالمستودع\tالرصيد الحالي", "Z\t01\t0"]));
    const s = [salesHeader()]; let de = 1;
    const q = [1000, 980, 1020, 20, 1040, 40, 1100]; const ms = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
    ms.forEach((m, i) => s.push(saleRow(de++, m + '-10', 'Z', q[i])));
    await page.imp('salesInvoices', s.join('\n'));
    await page.imp('goodsReceipts', L(["DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tرمز المورد\tالكمية\tالمستودع", "1\t0\t2026-06-02\tZ\tS\t1040\t01", "2\t0\t2026-08-02\tZ\tS\t1100\t01"]));
    await page.refresh();
    const r = await page.evaluate(() => { const d = DEMAND.adjustedMonthlyDemand('Z'); const tl = INV.monthlyAvailableTimeline('Z'); return { raw: d.raw, adj: d.adjusted, conf: d.confidence, ex: d.excludedMonths.map(e => ({ m: e.month, q: e.qty, ex: !e.notExcluded, reason: e.reason, c: e.confidence })), tl: tl.map(t => t.month + ':' + t.opening + '/' + t.received + '/' + t.sold + '/' + t.closing) }; });
    console.log('    timeline:', r.tl.join(' | '));
    console.log('    raw=' + r.raw.toFixed(2) + ' adjusted=' + r.adj.toFixed(2) + ' conf=' + r.conf);
    r.ex.forEach(e => console.log('    ', e.m, e.q, e.ex ? 'EXCLUDED' : 'kept', '-', e.reason, '(' + e.c + ')'));
    check(6, 'Raw average = 742.86 (all 7 months)', near(r.raw, 5200 / 7, 0.01), r.raw.toFixed(2));
    check(6, 'May(20) & Jul(40) EXCLUDED with stock-out evidence (low opening + no receipt)', r.ex.filter(e => e.ex).map(e => e.m).join(',') === '2026-05,2026-07' && r.ex.filter(e => e.ex).every(e => /انقطاع/.test(e.reason)));
    check(6, 'Adjusted average = 1,028 (mean of 5 normal months), not 742', near(r.adj, 1028, 0.01), r.adj.toFixed(2));
    check(6, 'Reason + confidence reported per excluded month', r.ex.filter(e => e.ex).every(e => e.reason && ['HIGH', 'MEDIUM', 'LOW'].includes(e.c)));
    await page.evaluate(() => openItemDetail('Z'));
    const txt = await page.$eval('#drawerBox', e => e.innerText);
    check(6, 'Item drawer shows Raw / Adjusted / excluded months table with reasons', txt.includes('المتوسط الخام') && txt.includes('المتوسط المعدَّل') && txt.includes('استُبعد') && txt.includes('انقطاع'));
    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 7) CUSTOMER DRILL-DOWN ================= */
  console.log('\n[7] ' + SUITE_META[7].title);
  if (run(7)) { const { ctx, page } = await fresh(browser);
    const s = [salesHeader(), saleRow(1, '2026-07-01', 'K', 500, '01', 'C1', 'أ'), saleRow(2, '2026-07-02', 'K', 300, '01', 'C2', 'ب'), saleRow(3, '2026-07-03', 'K', 100, '01', 'C3', 'ج'), saleRow(4, '2026-07-04', 'K', 50, '01', 'C4', 'د', 1, 'Y')];
    await page.imp('salesInvoices', s.join('\n'));
    await page.imp('salesReturns', L(["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tالمبلغ\tملغى", "9\t0\t2026-07-09\tK\t250\t01\tC1\tأ\t10\tN"]));
    await page.refresh();
    await page.evaluate(() => { switchView('demand'); });
    await page.click('#demandTable .qty-click');
    const col = async () => page.$$eval('#ddTable tbody tr td:nth-child(1)', e => e.map(x => x.textContent.trim()).join(','));
    const q1 = await col();
    check(7, 'Monthly qty is NET (500−250=250 for C1 → order C2 300, C1 250, C3 100), default desc', q1 === 'C2,C1,C3', q1);
    await page.click('#ddTable thead th:has-text("الكمية الصافية")'); const q2 = await col();
    check(7, 'Click once → desc explicit', q2 === 'C2,C1,C3' && (await page.$eval('#ddTable thead th:has-text("الكمية الصافية") .si', e => e.textContent)) === '▼');
    await page.click('#ddTable thead th:has-text("الكمية الصافية")'); const q3 = await col();
    check(7, 'Click twice → asc', q3 === 'C3,C1,C2', q3);
    await page.click('#ddTable thead th:has-text("الكمية الصافية")'); const q4 = await col();
    check(7, 'Click thrice → reset (back to default highest→lowest)', q4 === 'C2,C1,C3' && (await page.$eval('#ddTable thead th:has-text("الكمية الصافية") .si', e => e.textContent)) === '⇅');
    check(7, 'Cancelled invoice customer (C4) absent', !q1.includes('C4'));
    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 8) DATA UPLOAD LIFECYCLE ================= */
  console.log('\n[8] ' + SUITE_META[8].title);
  if (run(8)) { const { ctx, page } = await fresh(browser);
    let de = 1; const hist = [salesHeader()];
    [2022, 2023, 2024, 2025].forEach(y => { for (let m = 1; m <= 12; m++) hist.push(saleRow(de++, `${y}-${String(m).padStart(2, '0')}-10`, 'H', 100)); });
    const r0 = await page.imp('salesInvoices', hist.join('\n'));
    check(8, 'Historical 2022–2025 imported (48 rows)', r0.added === 48);
    const batchesBefore = await page.evaluate(() => STATE.data.salesInvoices.map(r => r._key + '|' + r._importBatch).sort().join(';'));
    await page.evaluate(() => DB.setMeta('historicalLocked', true));
    const u1 = [salesHeader()]; for (let m = 1; m <= 5; m++) u1.push(saleRow(1000 + m, `2026-0${m}-10`, 'H', 200)); u1.push(saleRow(9999, '2024-03-03', 'H', 777));
    const r1 = await page.imp('salesInvoices', u1.join('\n'));
    check(8, '2026 update #1: 5 added, 2024 row blocked by lock', r1.added === 5 && r1.imported === 5 && r1.preview.lockedRowsTouched === 1, JSON.stringify({ added: r1.added, imported: r1.imported, locked: r1.preview.lockedRowsTouched }));
    const u2 = [salesHeader()]; for (let m = 1; m <= 8; m++) u2.push(saleRow(1000 + m, `2026-0${m}-10`, 'H', m === 3 ? 250 : 200));
    const r2 = await page.imp('salesInvoices', u2.join('\n'));
    check(8, '2026 update #2: 3 new, 1 updated, 4 unchanged — no duplicates', r2.added === 3 && r2.updated === 5 && r2.preview.toAdd === 3 && r2.preview.toUpdate === 1 && r2.preview.unchanged === 4, JSON.stringify({ added: r2.added, updated: r2.updated, p: r2.preview }));
    const after = await page.evaluate(() => ({ n: STATE.data.salesInvoices.length, keys: new Set(STATE.data.salesInvoices.map(r => r._key)).size, mar: STATE.data.salesInvoices.find(r => r._key === '1003|0').Quantity, hist: STATE.data.salesInvoices.filter(r => r.DocDate.getFullYear() < 2026).map(r => r._key + '|' + r._importBatch).sort().join(';'), y2024: STATE.data.salesInvoices.filter(r => r._key === '9999|0').length }));
    check(8, 'Total = 48 + 8 = 56, all keys unique', after.n === 56 && after.keys === 56, after.n + '/' + after.keys);
    check(8, 'March 2026 updated incrementally to 250', after.mar === 250);
    check(8, '2022–2025 rows untouched (same keys, same import batch)', after.hist === batchesBefore && after.y2024 === 0);
    const log = await page.evaluate(async () => { const l = await DB.getAll('importLog'); return l.length; });
    check(8, 'Import log has 3 entries (rollback-able)', log === 3);
    await page.reload(); await page.waitForFunction(() => window.APP_READY === true);
    const persisted = await page.evaluate(async () => ({ n: STATE.data.salesInvoices.length, locked: await DB.getMeta('historicalLocked', false), badge: document.getElementById('ctxBaseline').innerText }));
    check(8, 'Persisted after reload (56 rows, lock kept, 2026 "محدَّث")', persisted.n === 56 && persisted.locked === true && persisted.badge.includes('محدَّث'), persisted.badge);
    const rb = await page.evaluate(() => IMPORT.rollback('salesInvoices'));
    const afterRb = await page.evaluate(() => ({ n: STATE.data.salesInvoices.length, mar: STATE.data.salesInvoices.find(r => r._key === '1003|0').Quantity }));
    check(8, 'Rollback of update #2 → 53 rows, March back to 200', rb.ok && afterRb.n === 53 && afterRb.mar === 200);
    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 9) PERFORMANCE — representative dataset ================= */
  console.log('\n[9] ' + SUITE_META[9].title);
  if (run(9)) { const { ctx, page } = await fresh(browser);
    const t = {};
    const gen = await page.evaluate(async () => {
      const T = {};
      const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
      const NI = 1500, NS = 200000, NC = 1200, NSUP = 60;
      const items = Array.from({ length: NI }, (_, i) => 'ITM' + String(i + 1).padStart(5, '0'));
      const sup = Array.from({ length: NSUP }, (_, i) => 'S' + String(i + 1).padStart(3, '0'));
      const t0 = performance.now();
      const supTsv = ["رمز المورد\tاسم المورد\tالبلد\tمدة التوريد"].concat(sup.map((s, i) => `${s}\tمورد ${i + 1}\t${['TR', 'EG', 'CN', 'IN', 'BR'][i % 5]}\t${i % 3 ? 30 + i % 20 : ''}`)).join('\n');
      const itemTsv = ["رمز الصنف\tاسم الصنف\tمجموعة الصنف\tوحدة القياس\tوزن الوحدة"].concat(items.map((c, i) => `${c}\tصنف ${i + 1}\tمجموعة ${i % 12}\tكرتون\t${rnd(5, 25)}`)).join('\n');
      const invRows = ["رمز الصنف\tالمستودع\tالرصيد الحالي\tتحت الطلب"]; items.forEach(c => { invRows.push(`${c}\t01\t${rnd(0, 3000)}\t0`); if (Math.random() < 0.3) invRows.push(`${c}\t004\t${rnd(0, 50)}\t0`); if (Math.random() < 0.2) invRows.push(`${c}\t011\t${rnd(0, 300)}\t0`); });
      const piRows = ["DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tرمز المورد\tالمورد\tالكمية\tالسعر"]; let pe = 1;
      items.forEach((c, i) => { const s = sup[i % NSUP]; const n = rnd(2, 6); for (let k = 0; k < n; k++) piRows.push(`${pe++}\t0\t${2022 + rnd(0, 4)}-${String(rnd(1, 12)).padStart(2, '0')}-${String(rnd(1, 28)).padStart(2, '0')}\t${c}\t${s}\tمورد\t${[500, 1000, 2000][rnd(0, 2)]}\t${rnd(1, 20)}`); });
      const poRows = ["DocEntry\tLineNum\tتاريخ الأمر\tتاريخ التسليم\tرمز الصنف\tرمز المورد\tالكمية\tالمتبقي\tالحالة"]; for (let k = 0; k < 400; k++) { const i = rnd(0, NI - 1); poRows.push(`${k + 1}\t0\t2026-0${rnd(5, 8)}-10\t2026-${rnd(0, 1) ? '08' : '11'}-15\t${items[i]}\t${sup[i % NSUP]}\t1000\t1000\tO`); }
      const grRows = ["DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tرمز المورد\tالكمية\tالمستودع"]; for (let k = 0; k < 500; k++) { const i = rnd(0, NI - 1); grRows.push(`${k + 1}\t0\t2026-0${rnd(1, 8)}-15\t${items[i]}\t${sup[i % NSUP]}\t1000\t01`); }
      const bRows = ["رمز الصنف\tالباتش\tالمستودع\tتاريخ الانتهاء\tكمية الباتش"]; for (let k = 0; k < 3000; k++) { const i = rnd(0, NI - 1); bRows.push(`${items[i]}\tB${k}\t01\t2026-${String(rnd(8, 12)).padStart(2, '0')}-${String(rnd(1, 28)).padStart(2, '0')}\t${rnd(10, 400)}`); }
      const sRows = new Array(NS + 1); sRows[0] = "DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tاسم الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tالمبلغ\tملغى";
      for (let k = 1; k <= NS; k++) { const i = rnd(0, NI - 1); const y = 2022 + Math.floor((k - 1) / (NS / 4.75)); const yy = Math.min(y, 2026); const m = yy === 2026 ? rnd(1, 9) : rnd(1, 12); const c = rnd(1, NC); sRows[k] = `${k}\t0\t${yy}-${String(m).padStart(2, '0')}-${String(rnd(1, 28)).padStart(2, '0')}\tITM${String(i + 1).padStart(5, '0')}\tصنف ${i + 1}\t${rnd(1, 120)}\t${Math.random() < 0.1 ? '011' : '01'}\tC${c}\tعميل ${c}\t${rnd(10, 900)}\t${Math.random() < 0.01 ? 'Y' : 'N'}`; }
      const retRows = ["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tالمبلغ\tملغى"]; for (let k = 1; k <= 5000; k++) { const i = rnd(0, NI - 1); retRows.push(`${k}\t0\t${2022 + rnd(0, 4)}-${String(rnd(1, 9)).padStart(2, '0')}-10\tITM${String(i + 1).padStart(5, '0')}\t${rnd(1, 20)}\t01\tC${rnd(1, NC)}\tعميل\t50\tN`); }
      T.generate = performance.now() - t0;
      async function imp(k, tsv) { const a = performance.now(); const { mapped, errors } = IMPORT.mapRows(k, tsv); const b = performance.now(); await IMPORT.preview(k, mapped); const c = performance.now(); const res = await IMPORT.commit(k, mapped, { errorCount: errors.length }); const d = performance.now(); return { rows: mapped.length, parse: Math.round(b - a), preview: Math.round(c - b), commit: Math.round(d - c) }; }
      T.suppliers = await imp('suppliers', supTsv); T.items = await imp('items', itemTsv); T.inventory = await imp('inventory', invRows.join('\n'));
      T.purchaseInvoices = await imp('purchaseInvoices', piRows.join('\n')); T.purchaseOrders = await imp('purchaseOrders', poRows.join('\n')); T.goodsReceipts = await imp('goodsReceipts', grRows.join('\n'));
      T.batches = await imp('batches', bRows.join('\n')); T.sales = await imp('salesInvoices', sRows.join('\n')); T.returns = await imp('salesReturns', retRows.join('\n'));
      return T;
    });
    console.log('    generate ms:', Math.round(gen.generate), '| sales import (200k):', JSON.stringify(gen.sales), '| returns:', JSON.stringify(gen.returns), '| purchaseInvoices:', JSON.stringify(gen.purchaseInvoices));
    check(9, 'Import 200,000 sales lines < 60s (parse+preview+commit)', (gen.sales.parse + gen.sales.preview + gen.sales.commit) < 60000, (gen.sales.parse + gen.sales.preview + gen.sales.commit) + ' ms');
    const tl0 = Date.now(); await page.reload(); await page.waitForFunction(() => window.APP_READY === true, null, { timeout: 120000 }); t.initialLoad = Date.now() - tl0;
    console.log('    initial load (IndexedDB → memory → first view):', t.initialLoad, 'ms');
    check(9, 'Initial load < 30s', t.initialLoad < 30000, t.initialLoad + ' ms');
    const eng = await page.evaluate(async () => { window.__calls = 0; const orig = RECO.computeForItem.bind(RECO); RECO.computeForItem = function (c) { if (!RECO._cache.has(c)) window.__calls++; return orig(c); }; const a = performance.now(); invalidateData(); STATE._recos = null; STATE._recosAll = null; STATE._salesReport = null; getRecosAll(); const b = performance.now(); getRecos(); getSalesReport(); const c = performance.now(); return { engineMs: Math.round(b - a), listReportMs: Math.round(c - b), calls: window.__calls, items: getRecosAll().length, lines: SALES.buildNetLines().length }; });
    console.log('    engine:', JSON.stringify(eng));
    check(9, 'Recommendation engine over 1,500 items (200k lines) < 20s', eng.engineMs < 20000, eng.engineMs + ' ms');
    check(9, 'Normalization: net lines cached (200k + 5k returns − cancelled)', eng.lines > 195000 && eng.lines < 205000, '' + eng.lines);
    const ui = await page.evaluate(async () => {
      const out = {}; const m = (name, fn) => { window.__calls = 0; const a = performance.now(); fn(); out[name] = { ms: Math.round(performance.now() - a), calls: window.__calls }; };
      m('switchDecisions', () => switchView('decisions'));
      m('sort', () => { toggleSort('decisions', 'available'); });
      m('sort2', () => { toggleSort('decisions', 'demand'); });
      m('openWhy', () => openWhyDrawer(getRecos()[0].ItemCode));
      m('openItem', () => openItemDetail(getRecos()[0].ItemCode));
      m('openSupplier', () => openSupplierDetail(getRecos()[0].supplier.code));
      m('switchDemand', () => switchView('demand'));
      m('drilldown', () => { const r = getSalesReport().rows[0]; const mk = [...r.monthly.keys()][0]; openCustomerDrilldown(r.ItemCode, mk); });
      m('switchPlan', () => switchView('plan'));
      m('switchItems', () => switchView('items'));
      m('switchSuppliers', () => switchView('suppliers'));
      window.__calls = 0; const a = performance.now(); STATE.filters.supplier = 'S001'; refreshComputed(); getRecos(); out.filterApply = { ms: Math.round(performance.now() - a), calls: window.__calls }; STATE.filters.supplier = ''; refreshComputed(); getRecos();
      return out;
    });
    Object.entries(ui).forEach(([k, v]) => console.log('    ' + k.padEnd(16), String(v.ms).padStart(6) + ' ms', 'engine calls=' + v.calls));
    const noRecalc = ['switchDecisions', 'sort', 'sort2', 'openWhy', 'openItem', 'openSupplier', 'switchDemand', 'drilldown', 'switchPlan', 'switchItems', 'switchSuppliers'].every(k => ui[k].calls === 0);
    check(9, 'NO engine recalculation (cache misses = 0) on view switch / sort / drawers / drill-down', noRecalc);
    check(9, 'Sorting < 1.5s, drawers < 1.5s, drill-down < 1.5s on big data', ['sort', 'sort2', 'openWhy', 'openItem', 'openSupplier', 'drilldown'].every(k => ui[k].ms < 1500));
    check(9, 'Filter apply (legit recompute) < 20s', ui.filterApply.ms < 20000, ui.filterApply.ms + ' ms');
    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 10) PHASE 2 — SAP REALITY ALIGNMENT ================= */
  console.log('\n[10] ' + SUITE_META[10].title);
  if (run(10)) { const { ctx, page } = await fresh(browser);
    await page.imp('purchaseOrders', L(["DocEntry\tLineNum\tتاريخ الأمر\tتاريخ التسليم\tرمز الصنف\tرمز المورد\tالكمية\tالمتبقي\tالحالة",
      "9000\t0\t2026-01-01\t2026-12-31\tPINV\tSX\t500\t50\tO"]));
    await page.imp('purchaseInvoices', L(["DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tCardCode\tالكمية\tBaseEntry\tBaseLine\tBaseType",
      "9100\t0\t2026-02-01\tPINV\tSX\t300\t9000\t0\t22"]));
    await page.refresh();
    const r1 = await page.evaluate(() => POTRACK.statusFor('PINV')[0]);
    check(10, '10.1 Received qty counted from direct Purchase Invoice (BaseType=22), no GRPO needed', r1.received === 300, JSON.stringify(r1));
    check(10, '10.1 "remaining" still driven by SAP OpenQty itself (correct regardless of receipt path)', r1.remaining === 50);
    await page.imp('goodsReceipts', L(["DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tرمز المورد\tالكمية\tالمستودع\tBaseEntry",
      "9200\t0\t2026-02-05\tPINV\tSX\t150\t01\t9000"]));
    await page.refresh();
    const r2 = await page.evaluate(() => POTRACK.statusFor('PINV')[0]);
    check(10, '10.2 GRPO + direct Invoice both counted additively, no double counting (300+150=450, not 600 or 300)', r2.received === 450, JSON.stringify(r2));

    await page.imp('purchaseOrders', L(["DocEntry\tLineNum\tتاريخ الأمر\tتاريخ التسليم\tرمز الصنف\tرمز المورد\tالكمية\tالمتبقي\tالحالة",
      "9001\t0\t2026-01-01\t2026-03-01\tUNMATCHED\tSX\t100\t0\tO"]));
    await page.refresh();
    const r3 = await page.evaluate(() => POTRACK.statusFor('UNMATCHED'));
    check(10, '10.3 Closed PO line (OpenQty=0) with no GRPO/Invoice match is silently excluded from in-transit — no crash, no false incoming', r3.length === 0, JSON.stringify(r3));

    const s4 = [salesHeader(), saleRow(1, '2026-05-01', 'RETX', 100, '01', 'C1', 'عميل')];
    await page.imp('salesInvoices', s4.join('\n'));
    await page.imp('salesReturns', L(["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tالمبلغ\tملغى", "20\t0\t2026-05-05\tRETX\t20\t01\tC1\tعميل\t100\tN"]));
    await page.imp('physicalReturns', L(["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tالكمية\tCardCode\tالعميل", "30\t0\t2026-05-06\tRETX\t15\tC1\tعميل"]));
    await page.refresh();
    const r4 = await page.evaluate(() => { const lines = SALES.linesForItem('RETX'); const net = lines.reduce((a, l) => a + l.qty, 0); const reco = RECO.computeForItem('RETX'); const physReason = reco.reasons.find(x => x.k.includes('ORDN')); return { net, physReasonV: physReason && physReason.v }; });
    check(10, '10.4 Net sales = 100-20=80 (physicalReturns/ORDN NOT auto-subtracted — avoids unconfirmed double count)', r4.net === 80, JSON.stringify(r4));
    check(10, '10.4 ORDN qty (15) still surfaced informationally in Why-drawer reasons', String(r4.physReasonV) === '15', JSON.stringify(r4));

    await page.imp('salesQuotations', L(["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tرمز العميل\tالكمية\tالمفتوح",
      "40\t0\t2026-06-01\tQINV\tC1\t100\t0", "41\t0\t2026-06-02\tQOPEN\tC1\t50\t50"]));
    await page.refresh();
    const r5 = await page.evaluate(() => ({ qinv: POTRACK.openQuotationQty('QINV'), qopen: POTRACK.openQuotationQty('QOPEN'), weight: CONFIG.tunable.quotationWeight }));
    check(10, '10.5 Fully-invoiced quotation (OpenQty=0) contributes 0 open demand (already reflected in real Invoice, no separate BaseType=23 tracking needed)', r5.qinv === 0, JSON.stringify(r5));
    check(10, '10.5 Still-open quotation keeps its OpenQty; quotationWeight untouched (0.30, not auto-set to 1.0)', r5.qopen === 50 && r5.weight === 0.30, JSON.stringify(r5));

    await page.imp('items', L(["رمز الصنف\tاسم الصنف\tمدة توريد الصنف", "LTIT1\tصنف 1\t45", "LTIT2\tصنف 2\t45"]));
    await page.imp('suppliers', L(["رمز المورد\tاسم المورد\tمدة التوريد", "SLT2\tمورد 2\t20"]));
    await page.imp('purchaseInvoices', L(["DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tCardCode\tالكمية",
      "9300\t0\t2026-01-01\tLTIT1\tSLT1\t100", "9301\t0\t2026-01-01\tLTIT2\tSLT2\t100"]));
    await page.refresh();
    const r6 = await page.evaluate(() => {
      const s1 = resolveSupplierForItem('LTIT1'), s2 = resolveSupplierForItem('LTIT2');
      return { lt1: SUPPLIER.leadTimeDays(s1.code, 'LTIT1'), lt2: SUPPLIER.leadTimeDays(s2.code, 'LTIT2'), reco1: RECO.computeForItem('LTIT1').leadTime };
    });
    check(10, '10.6 No supplier lead time uploaded → falls back to OITM.LeadTime (item_master, 45 days)', r6.lt1.days === 45 && r6.lt1.source === 'item_master', JSON.stringify(r6.lt1));
    check(10, '10.6 Manual supplier lead time (20d), when present, still wins over item-level (45d)', r6.lt2.days === 20 && r6.lt2.source === 'supplier_master', JSON.stringify(r6.lt2));
    check(10, '10.6 End-to-end via RECO.computeForItem uses the same item-level fallback (45d)', r6.reco1.days === 45 && r6.reco1.source === 'item_master', JSON.stringify(r6.reco1));

    const noWhsHeaderOk = await page.evaluate(() => {
      const { unmatched } = IMPORT.mapRows('batches', "رمز الصنف\tالباتش\tتاريخ الانتهاء\tكمية الباتش\nBQTY\tB1\t2026-10-01\t200");
      return unmatched.length === 0;
    });
    check(10, '10.7 Batch upload with NO warehouse column maps cleanly (item-level only, matches live SAP evidence)', noWhsHeaderOk);
    await page.imp('batches', L(["رمز الصنف\tالباتش\tتاريخ الانتهاء\tكمية الباتش", "BQTY\tB1\t2026-10-01\t200"]));
    await page.refresh();
    const r7 = await page.evaluate(() => { switchView('risks'); return { near30: INV.nearExpiryQty('BQTY', 'NEAR30'), hasWhsCol: document.getElementById('riskExpiry').innerHTML.includes('المستودع') }; });
    check(10, '10.7 nearExpiryQty computed correctly at item level (200 within 30d bucket)', r7.near30 === 200, JSON.stringify(r7));
    check(10, '10.7 Expiry risk table no longer shows a misleading "المستودع" (warehouse) column', !r7.hasWhsCol);

    const r8 = await page.evaluate(() => ({ w: unitWeightOf('LTIT1') }));
    check(10, '10.8 unitWeightOf() sources weight exclusively from items.UnitWeight (OITM.SWeight1) — no PCH1 weight field exists to read from', r8.w === null, JSON.stringify(r8) + ' (LTIT1 had no UnitWeight uploaded, so null is correct — confirms no fallback to any purchase-line weight)');

    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 11) PILOT REVIEW ================= */
  console.log('\n[11] ' + SUITE_META[11].title);
  if (run(11)) { const { ctx, page } = await fresh(browser);
    await page.imp('suppliers', L(["رمز المورد\tاسم المورد\tالبلد\tمدة التوريد", "SP\tمورد الطيار\tTR\t20"]));
    await page.imp('inventory', L(["رمز الصنف\tالمستودع\tالرصيد الحالي", "PIL1\t01\t0"]));
    const s = [salesHeader()]; let de = 100;
    ['2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10'].forEach(d => s.push(saleRow(de++, d, 'PIL1', 300)));
    await page.imp('salesInvoices', s.join('\n'));
    await page.imp('purchaseInvoices', L(["DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tCardCode\tالكمية", "1\t0\t2025-01-01\tPIL1\tSP\t300"]));
    await page.refresh();

    const created = await page.evaluate(async () => {
      const before = RECO.computeForItem('PIL1');
      const rec = await PILOT.create('PIL1', { buyerName: 'أحمد', buyerDecision: 'DISAGREE_LESS', buyerQty: 50, buyerNote: 'المخزون الفعلي أكبر مما يظهر' });
      return { id: rec.id, status: rec.status, snapStatus: rec.recommendation.status, snapQty: rec.recommendation.recommendedQty, beforeStatus: before.status, beforeQty: before.recommendedQty };
    });
    check(11, '11.1 Create disagreement: OPEN status, snapshot equals the live recommendation at that moment', created.status === 'OPEN' && created.snapStatus === created.beforeStatus && created.snapQty === created.beforeQty, JSON.stringify(created));

    await page.imp('inventory', L(["رمز الصنف\tالمستودع\tالرصيد الحالي", "PIL1\t02\t5000"]));
    await page.refresh();
    const immut = await page.evaluate((id) => {
      const live = RECO.computeForItem('PIL1');
      const rec = STATE.pilotReviews[id];
      return { snapQty: rec.recommendation.recommendedQty, snapStatus: rec.recommendation.status, liveQty: live.recommendedQty, liveStatus: live.status };
    }, created.id);
    check(11, '11.2 Snapshot stays frozen after a later data change recomputes the live recommendation', immut.snapQty === created.snapQty && immut.snapStatus === created.snapStatus, JSON.stringify(immut));
    check(11, '11.2 …proven meaningful: the live recommendation actually changed (not frozen by coincidence)', immut.liveQty !== immut.snapQty || immut.liveStatus !== immut.snapStatus, JSON.stringify(immut));

    const edited = await page.evaluate(async (id) => {
      await PILOT.setStatus(id, 'REVIEWED', 'راجعتها — الكمية الفعلية بالمستودع أعلى');
      const afterReview = JSON.parse(JSON.stringify(STATE.pilotReviews[id]));
      await PILOT.setStatus(id, 'CLOSED', 'أُغلق بعد تصحيح بيانات المخزون');
      const afterClose = JSON.parse(JSON.stringify(STATE.pilotReviews[id]));
      return { afterReview, afterClose };
    }, created.id);
    check(11, '11.3 Edit: status → REVIEWED sets reviewedAt and stores the review note', edited.afterReview.status === 'REVIEWED' && !!edited.afterReview.reviewedAt && edited.afterReview.reviewNote.includes('راجعتها'));
    check(11, '11.3 Close: status → CLOSED sets closedAt, keeps buyer fields and the recommendation snapshot untouched', edited.afterClose.status === 'CLOSED' && !!edited.afterClose.closedAt && edited.afterClose.buyerName === 'أحمد' && edited.afterClose.recommendation.recommendedQty === created.snapQty);

    await page.evaluate(async () => { await PILOT.create('PIL1', { buyerName: 'سارة', buyerDecision: 'AGREE', buyerQty: null, buyerNote: '' }); });
    const summary = await page.evaluate(() => PILOT.summary());
    check(11, '11.4 Summary KPIs aggregate correctly (2 total, 1 closed, 1 open, 1 agree, 1 disagree)', summary.total === 2 && summary.closed === 1 && summary.open === 1 && summary.agree === 1 && summary.disagree === 1, JSON.stringify(summary));

    await page.evaluate(() => switchView('pilot'));
    const filt1 = await page.evaluate(() => { STATE.pilotFilter = { status: 'CLOSED', decision: '', q: '' }; TABLES.pilot(); return document.querySelectorAll('#pilotTable tbody tr').length; });
    check(11, '11.5 Filter by status=CLOSED shows only the closed entry', filt1 === 1, filt1);
    const filt2 = await page.evaluate(() => { STATE.pilotFilter = { status: '', decision: 'AGREE', q: '' }; TABLES.pilot(); return document.querySelectorAll('#pilotTable tbody tr').length; });
    check(11, '11.5 Filter by decision=AGREE shows only the agreeing entry', filt2 === 1, filt2);
    const filt3 = await page.evaluate(() => { STATE.pilotFilter = { status: '', decision: '', q: 'nomatch' }; TABLES.pilot(); return document.getElementById('pilotTable').innerText; });
    check(11, '11.5 Search filter with no match shows the empty state, not a stale table', filt3.includes('لا توجد سجلات'));
    await page.evaluate(() => { STATE.pilotFilter = { status: '', decision: '', q: '' }; TABLES.pilot(); });

    const printed = await page.evaluate(() => { const before = getRecosAll().length; printCurrentView(); const html = document.getElementById('printRoot').innerHTML; const after = getRecosAll().length; return { hasTitle: html.includes('مراجعة الطيار'), before, after }; });
    check(11, '11.6 Print: pilot view print output includes the report title and triggers no engine recompute', printed.hasTitle && printed.before === printed.after, JSON.stringify(printed));

    await page.reload(); await page.waitForFunction(() => window.APP_READY === true, null, { timeout: 15000 });
    const reloaded = await page.evaluate(() => ({ total: Object.keys(STATE.pilotReviews).length, summary: PILOT.summary() }));
    check(11, '11.7 Persistence: all pilot review entries reload from IndexedDB after a fresh page load', reloaded.total === 2 && reloaded.summary.closed === 1 && reloaded.summary.agree === 1, JSON.stringify(reloaded));

    const safety = await page.evaluate(() => ({ status: RECO.computeForItem('PIL1').status, invRows: STATE.data.inventory.length, planOverridesCount: Object.keys(STATE.planOverrides).length }));
    check(11, '11.8 Safety: recommendation engine, stored inventory rows and plan overrides are exactly what the business logic produced — Pilot Review never wrote back into them', safety.status === immut.liveStatus && safety.invRows === 2 && safety.planOverridesCount === 0, JSON.stringify(safety));

    errorsAll.push(...page.errors); await ctx.close(); }

  /* ================= 12) LOGIN / PERMISSIONS GATE ================= */
  console.log('\n[12] ' + SUITE_META[12].title);
  if (run(12)) {
    { const { ctx, page } = await authPage(browser, null, true);
      await page.waitForFunction(() => { const el = document.getElementById('loginMsg'); return el && el.textContent.length > 0; }, null, { timeout: 8000 });
      const r = await page.evaluate(() => ({
        appReady: window.APP_READY === true,
        appVisible: getComputedStyle(document.getElementById('appView')).display !== 'none',
        loginMsg: document.getElementById('loginMsg').textContent,
      }));
      check(12, '12.1 No permission row on this screen_id → denied, signed out, appView never shown', !r.appReady && !r.appVisible && r.loginMsg.includes('صلاحية'), JSON.stringify(r));
      errorsAll.push(...page.errors); await ctx.close(); }

    { const { ctx, page } = await authPage(browser, 'VIEW', true);
      await page.waitForFunction(() => window.APP_READY === true, null, { timeout: 8000 });
      const before = await page.evaluate(() => DB.getMeta('historicalLocked', false));
      const r = await page.evaluate(async (before) => {
        const role = document.getElementById('uRole').textContent;
        const appVisible = getComputedStyle(document.getElementById('appView')).display !== 'none';
        await lockHistoricalToggle();
        const afterAdmin = await DB.getMeta('historicalLocked', false);
        await setPlanOverride('__PERMTEST__', {});
        planSetNote('__PERMTEST__', 'محاولة view');
        await new Promise(r => setTimeout(r, 30));
        return { role, appVisible, blockedAdmin: afterAdmin === before, blockedInput: (STATE.planOverrides['__PERMTEST__'] || {}).note !== 'محاولة view' };
      }, before);
      check(12, '12.2 VIEW permission: signs in and sees the app', r.appVisible && r.role.includes('عرض فقط'), JSON.stringify(r));
      check(12, '12.2 VIEW permission: admin-tier action (lockHistoricalToggle) is blocked at the function level', r.blockedAdmin);
      check(12, '12.2 VIEW permission: input-tier action (planSetNote) is blocked at the function level', r.blockedInput);
      errorsAll.push(...page.errors); await ctx.close(); }

    { const { ctx, page } = await authPage(browser, 'INPUT', true);
      await page.waitForFunction(() => window.APP_READY === true, null, { timeout: 8000 });
      const before = await page.evaluate(() => DB.getMeta('historicalLocked', false));
      const r = await page.evaluate(async (before) => {
        const role = document.getElementById('uRole').textContent;
        planSetNote('__PERMTEST__', 'محاولة input');
        await new Promise(r => setTimeout(r, 30));
        const inputAllowed = (STATE.planOverrides['__PERMTEST__'] || {}).note === 'محاولة input';
        await lockHistoricalToggle();
        const afterAdmin = await DB.getMeta('historicalLocked', false);
        return { role, inputAllowed, blockedAdmin: afterAdmin === before };
      }, before);
      check(12, '12.3 INPUT permission: input-tier action (planSetNote) succeeds', r.inputAllowed && r.role.includes('إدخال بيانات'), JSON.stringify(r));
      check(12, '12.3 INPUT permission: admin-tier action (lockHistoricalToggle) is still blocked', r.blockedAdmin);
      errorsAll.push(...page.errors); await ctx.close(); }

    { const { ctx, page } = await authPage(browser, 'ADMIN', false);
      const gateBefore = await page.evaluate(() => ({ loginVisible: getComputedStyle(document.getElementById('loginView')).display !== 'none', appVisible: getComputedStyle(document.getElementById('appView')).display !== 'none' }));
      check(12, '12.4 No session yet: login form shown, app hidden', gateBefore.loginVisible && !gateBefore.appVisible, JSON.stringify(gateBefore));
      await page.fill('#loginEmail', 'admin@kaylani.local');
      await page.fill('#loginPass', 'anything');
      await page.click('#loginBtn');
      await page.waitForFunction(() => window.APP_READY === true, null, { timeout: 8000 });
      const before = await page.evaluate(() => DB.getMeta('historicalLocked', false));
      const r = await page.evaluate(async (before) => {
        const role = document.getElementById('uRole').textContent;
        const appVisible = getComputedStyle(document.getElementById('appView')).display !== 'none';
        const loginHidden = getComputedStyle(document.getElementById('loginView')).display === 'none';
        await lockHistoricalToggle();
        const after = await DB.getMeta('historicalLocked', false);
        return { role, appVisible, loginHidden, adminAllowed: after !== before };
      }, before);
      check(12, '12.4 doLogin() end-to-end: real form submit signs in, shows the app', r.appVisible && r.loginHidden && r.role.includes('مدير'), JSON.stringify(r));
      check(12, '12.4 ADMIN permission: admin-tier action (lockHistoricalToggle) succeeds', r.adminAllowed);
      errorsAll.push(...page.errors); await ctx.close(); }
  }

  await browser.close();
  return { results: R, errors: errorsAll };
}

if (require.main === module) {
  main().then(({ results, errors }) => {
    const failed = results.filter(r => !r.ok);
    console.log('\n==================== BUSINESS-LOGIC SUITE SUMMARY ====================');
    console.log('Tests:', results.length, '| Passed:', results.length - failed.length, '| Failed:', failed.length);
    failed.forEach(f => console.log('  FAILED [' + f.id + '] ' + f.name + ' ' + (f.info || '')));
    console.log('Console/page errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
    process.exit(failed.length || errors.length ? 1 : 0);
  });
} else {
  module.exports = { main, SUITE_META };
}
