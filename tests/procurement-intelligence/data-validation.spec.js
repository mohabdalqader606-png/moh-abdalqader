/* Data-validation / edge-case suite — Foreign Procurement Intelligence screen.
   Covers negative/edge inputs NOT already exercised by business-logic.spec.js (84 checks),
   e2e.spec.js (54 checks) or the golden-dataset (91 checks): negative inventory, duplicate
   mapping across import batches, empty datasets, malformed dates, missing required fields,
   duplicate keys within one file, explicit-zero MOQ/multiplier/lead-time, an orphan supplier
   reference, quotation-only demand, an extreme quantity, and an item known only through
   purchase orders. Each case documents the ACTUAL observed behavior (read directly from
   IMPORT.mapRows / IMPORT.commit / RECO.computeForItem in المشتريات_الخارجية_الذكية.html) —
   not an assumption of what "should" happen. Where a case surfaces a data-quality risk rather
   than a defect (e.g. DV-04: one bad date silently drops an entire PO line), it is documented
   as such, not asserted as if it were a bug to fix — this phase is test-foundation only, no
   production logic changes. */
'use strict';
const { launchBrowser, freshPage, check: rawCheck, L } = require('./harness');
const { H, supplierRow, invRow, mapRow } = require('./fixtures/golden-dataset');

const R = [];
const errorsAll = [];
function check(id, name, ok, info) { rawCheck(R, id, name, ok, info); }

async function withPage(browser, fn) {
  const { ctx, page } = await freshPage(browser);
  try { return await fn(page); } finally { errorsAll.push(...page.errors); await ctx.close(); }
}

async function main() {
  const browser = await launchBrowser();

  /* DV-01: negative inventory on-hand — the "الرصيد الحالي"/OnHand column carries no
     negative-quantity guard (only columns whose key/label matches qty|quantity|كمية do,
     per IMPORT.mapRows لاين 1304 — OnHand doesn't), so it imports as-is. physicalStock is a
     raw sum (reflects the negative); availableStock clips to 0 (Math.max(0, raw-expired)). */
  await withPage(browser, async (page) => {
    await page.imp('inventory', L([H.inventory, invRow('DV01', -50)]));
    await page.refresh();
    const r = await page.evaluate(() => ({ physical: INV.physicalStock('DV01'), available: INV.availableStock('DV01') }));
    check('DV-01', 'صنف برصيد مخزون سالب — physicalStock يعكس الرقم السالب فعلياً', r.physical === -50, JSON.stringify(r));
    check('DV-01b', 'صنف برصيد مخزون سالب — availableStock يُقيَّد لـ0 (لا يُحتسب متاحاً سالباً)', r.available === 0, JSON.stringify(r));
  });

  /* DV-02: same item+supplier mapping re-imported in a SECOND batch with a different MOQ —
     upsert-by-key (ItemCode+SupplierCode), not a duplicate row; the latest value wins and
     feeds roundToHistoricalMultiple. */
  await withPage(browser, async (page) => {
    await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow('DV02', 'S1', '', 100, '')]));
    await page.refresh();
    const before = await page.evaluate(() => IDX.rows('itemSupplierMap', 'ItemCode', 'DV02').map(r => r.MOQ));
    const res2 = await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow('DV02', 'S1', '', 200, '')]));
    await page.refresh();
    const after = await page.evaluate(() => IDX.rows('itemSupplierMap', 'ItemCode', 'DV02').map(r => r.MOQ));
    check('DV-02', 'إعادة استيراد نفس ربط الصنف-المورد بدفعة ثانية بقيمة MOQ مختلفة — تحديث (upsert) لا تكرار', after.length === 1 && after[0] === 200 && res2.updated === 1, `before=${JSON.stringify(before)} after=${JSON.stringify(after)} res2=${JSON.stringify(res2)}`);
  });

  /* DV-03: header-only import (zero data rows) — commits cleanly, no crash. */
  await withPage(browser, async (page) => {
    const res = await page.imp('inventory', H.inventory);
    check('DV-03', 'استيراد ملف بالعناوين فقط (صفر أسطر بيانات) — يكتمل بلا خطأ، صفر إضافات', res.imported === 0 && res.rejected === 0, JSON.stringify(res));
  });

  /* DV-04: malformed date value on a "date"-typed column — IMPORT.mapRows رفض السطر بالكامل
     إذا فشل تحويل أي عمود تاريخ (لاين 1306-1310)، وليس مجرد تجاهل التاريخ وقبول باقي السطر —
     مخاطرة جودة بيانات حقيقية (سطر أمر شراء كامل يُفقد بسبب خطأ كتابي بخانة تاريخ واحدة)،
     موثَّقة هون كسلوك ملاحَظ لا كخلل يُصلَح ضمن هذه المرحلة. */
  await withPage(browser, async (page) => {
    const bad = L([H.purchaseOrders, '1\t0\t2026-01-01\tليس-تاريخ\tDV04\tS1\t100\t100\tO']);
    const r = await page.evaluate((tsv) => IMPORT.mapRows('purchaseOrders', tsv), bad);
    check('DV-04', 'تاريخ غير صالح بعمود "تاريخ التسليم" — السطر كاملاً يُرفض (لا يُستورد جزئياً بتاريخ فارغ)', r.mapped.length === 0 && r.errors.length === 1 && r.errors[0].msg.includes('تاريخ غير صالح'), JSON.stringify(r));
  });

  /* DV-05: required field blank (ItemCode empty on a sales row) — row rejected at mapRows,
     never reaches commit. */
  await withPage(browser, async (page) => {
    const bad = L([H.salesInvoices, '1\t0\t2026-01-05\t\tصنف بلا رمز\t10\t01\tC1\tعميل\t50\tN']);
    const r = await page.evaluate((tsv) => IMPORT.mapRows('salesInvoices', tsv), bad);
    check('DV-05', 'رمز صنف فارغ بسطر مبيعات — يُرفض عند mapRows (حقل إلزامي)، لا يصل لمرحلة الحفظ', r.mapped.length === 0 && r.errors.length === 1 && r.errors[0].msg.includes('مفقود'), JSON.stringify(r));
  });

  /* DV-06: duplicate DocEntry+LineNum within ONE import file — first occurrence wins, the
     repeat is rejected as an explicit duplicate-key error (not silently double-counted). */
  await withPage(browser, async (page) => {
    const dup = L([H.salesInvoices, '1\t0\t2026-01-05\tDV06\tصنف\t100\t01\tC1\tعميل\t500\tN', '1\t0\t2026-01-06\tDV06\tصنف\t999\t01\tC1\tعميل\t999\tN']);
    const r = await page.evaluate((tsv) => IMPORT.mapRows('salesInvoices', tsv), dup);
    check('DV-06', 'DocEntry+LineNum مكرر بنفس الملف — أول سطر فقط يُقبل، الثاني يُرفض كمكرر صريح (لا ازدواجية احتساب)', r.mapped.length === 1 && r.mapped[0].Quantity === 100 && r.errors.length === 1 && r.errors[0].msg.includes('مكرر'), JSON.stringify(r));
  });

  /* DV-07: explicit MOQ=0 and OrderMultiple=0 (not blank) — treated identically to "not set"
     (the rounding logic only checks ">0"), no crash, no accidental zero-rounding. */
  await withPage(browser, async (page) => {
    await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow('DV07', 'S1', '', 0, 0)]));
    await page.refresh();
    const qty = await page.evaluate(() => PURCHASE.roundToHistoricalMultiple('DV07', 'S1', 42));
    check('DV-07', 'MOQ=0 ومضاعف الطلب=0 صراحةً — يُعاملان كغير موجودَين (لا تقريب/لا كسر)، الكمية تبقى كما هي', qty === 42, `qty=${qty}`);
  });

  /* DV-08: explicit supplier LeadTimeDays=0 — the check is ">0", so 0 is NOT treated as a
     valid zero-day lead time; it falls through to the next source in the fallback chain. */
  await withPage(browser, async (page) => {
    await page.imp('suppliers', L([H.suppliers, supplierRow('S0', 'مورد صفر', 'TR', 0)]));
    await page.refresh();
    const lt = await page.evaluate(() => SUPPLIER.leadTimeDays('S0', null));
    check('DV-08', 'مدة توريد مورد = 0 صراحةً — لا تُعامل كمدة توريد صفر، تتجاوَز لمصدر بديل (افتراضي)', lt.source !== 'supplier_master' && lt.days === 30, JSON.stringify(lt));
  });

  /* DV-09: purchase order referencing a supplier code that never appears in the suppliers
     master at all — SUPPLIER.get returns undefined safely, lead time falls through to default,
     no crash. */
  await withPage(browser, async (page) => {
    await page.imp('purchaseOrders', L([H.purchaseOrders, '1\t0\t2026-01-01\t2026-03-01\tDV09\tGHOST\t100\t100\tO']));
    await page.refresh();
    const r = await page.evaluate(() => { const s = SUPPLIER.get('GHOST'); const lt = SUPPLIER.leadTimeDays('GHOST', 'DV09'); const rec = RECO.computeForItem('DV09'); return { supplierFound: !!s, leadTimeSource: lt.source, leadTimeDays: lt.days, recoStatus: rec.status, finite: Number.isFinite(rec.neededQtyRaw) }; });
    check('DV-09', 'رمز مورد "يتيم" بأمر شراء (غير موجود إطلاقاً بكشف الموردين) — لا كسر، مدة توريد تتجاوز لافتراضي', !r.supplierFound && r.leadTimeSource === 'default' && r.leadTimeDays === 30 && r.finite, JSON.stringify(r));
  });

  /* DV-10: quotation-only demand (no sales, no open sales order, only an open quotation) —
     hasDemand stays false (only monthlyDemand>0 || openSO>0 set it), yet the quotation-weighted
     horizon still produces recommendedQty>0, and status resolves via the `recommendedQty>0`
     fallback branch (line ~1953) rather than any of the hasDemand-gated CRITICAL/ORDER_SOON
     checks — a genuine, non-obvious documented behavior, not a bug. */
  await withPage(browser, async (page) => {
    await page.imp('suppliers', L([H.suppliers, supplierRow('S1', 'مورد DV10', 'TR', 10)]));
    await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow('DV10', 'S1')]));
    await page.imp('salesQuotations', L(['DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tرمز العميل\tالكمية\tالمفتوح', '1\t0\t2026-01-01\tDV10\tC1\t1000\t1000']));
    await page.refresh();
    const r = await page.evaluate(() => { const x = RECO.computeForItem('DV10'); return { hasDemandProxy: x.monthlyDemand === 0, status: x.status, recommendedQty: x.recommendedQty, openQuotation: x.openQuotation }; });
    check('DV-10', 'طلب مبني فقط على عرض سعر مفتوح (بلا مبيعات، بلا أمر بيع) — لا يُحتسب "طلب مؤكد" لكن التوصية لا تبقى صفراً', r.hasDemandProxy && r.openQuotation === 1000 && r.recommendedQty > 0 && r.status === 'ORDER_SOON', JSON.stringify(r));
  });

  /* DV-11: an extreme single-line quantity — no overflow/NaN/Infinity downstream. */
  await withPage(browser, async (page) => {
    await page.imp('salesInvoices', L([H.salesInvoices, '1\t0\t2026-01-05\tDV11\tصنف\t10000000\t01\tC1\tعميل\t50000000\tN']));
    await page.refresh();
    const r = await page.evaluate(() => { const x = RECO.computeForItem('DV11'); return { monthlyDemand: x.monthlyDemand, neededQtyRaw: x.neededQtyRaw, recommendedQty: x.recommendedQty }; });
    const finite = [r.monthlyDemand, r.neededQtyRaw, r.recommendedQty].every(v => Number.isFinite(v));
    check('DV-11', 'كمية سطر واحد ضخمة جداً (10 مليون) — لا NaN/Infinity/فيضان بأي حقل من نتيجة المحرك', finite, JSON.stringify(r));
  });

  /* DV-12: an item that exists ONLY via purchaseOrders — never sold, never in inventory or
     items master — allKnownItemCodes() still discovers it (purchaseOrders is one of the 5
     scanned sources), and computeForItem doesn't crash on a fully sparse item. */
  await withPage(browser, async (page) => {
    await page.imp('purchaseOrders', L([H.purchaseOrders, '1\t0\t2026-01-01\t2026-03-01\tDV12\tS1\t50\t50\tO']));
    await page.refresh();
    const r = await page.evaluate(() => { const known = allKnownItemCodes().includes('DV12'); const x = RECO.computeForItem('DV12'); return { known, status: x.status, available: x.available, physical: x.physical, finite: Number.isFinite(x.neededQtyRaw) }; });
    check('DV-12', 'صنف معروف فقط عبر أمر شراء (لا مبيعات، لا مخزون، لا بطاقة صنف) — يُكتشَف ويُحسب بلا كسر', r.known && r.finite && r.available === 0 && r.physical === 0, JSON.stringify(r));
  });

  /* DV-13: a zero-quantity sales line — passes validation (0 is not blank and not negative),
     contributes exactly 0 to the monthly series, no special-casing. */
  await withPage(browser, async (page) => {
    await page.imp('salesInvoices', L([H.salesInvoices, '1\t0\t2026-01-05\tDV13\tصنف\t0\t01\tC1\tعميل\t0\tN']));
    await page.refresh();
    const r = await page.evaluate(() => { const x = RECO.computeForItem('DV13'); return { monthlyDemand: x.monthlyDemand, seriesLen: x.demand.series.length }; });
    check('DV-13', 'سطر مبيعات بكمية صفر — يُقبل (ليس فارغاً ولا سالباً)، يساهم بصفر بالسلسلة الشهرية بلا استثناء خاص', r.monthlyDemand === 0 && r.seriesLen >= 1, JSON.stringify(r));
  });

  await browser.close();
  return { results: R, errors: errorsAll };
}

if (require.main === module) {
  main().then(({ results, errors }) => {
    const failed = results.filter(r => !r.ok);
    console.log('\n==================== DATA-VALIDATION SUMMARY ====================');
    console.log('Tests:', results.length, '| Passed:', results.length - failed.length, '| Failed:', failed.length);
    failed.forEach(f => console.log('  FAILED [' + f.id + '] ' + f.name + ' ' + (f.info || '')));
    console.log('Console/page errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
    process.exit(failed.length || errors.length ? 1 : 0);
  }).catch(e => { console.error('FATAL', e); process.exit(2); });
} else {
  module.exports = { main };
}
