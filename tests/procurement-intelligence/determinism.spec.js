/* Determinism suite — proves the recommendation engine produces byte-identical results for
   byte-identical input, run twice in two independent fresh browser contexts. This is the check
   that rules out hidden nondeterminism: Map/object iteration order, Date.now()/Math.random()
   leaking into the formula chain, or any other run-to-run instability that a single-run test
   (business-logic.spec.js, golden-dataset.spec.js) could never catch on its own — a bug that
   only shows up as "same input, different output" is invisible to any suite that runs once.

   The fixture is self-contained (not reused from golden-dataset.js): merging scenarios that
   were each designed assuming an isolated fresh context would collide on reused DocEntry
   numbers and reused supplier codes across scenarios, corrupting the dataset instead of
   testing determinism cleanly. It deliberately mixes five distinct code paths — plain stable
   demand, low-coverage CRITICAL, overstock, a confirmed future PO (in-transit), and a
   manually-confirmed late PO (setDocOverride) — so the override path is covered by the
   determinism check too, not just plain imports. */
'use strict';
const { launchBrowser, freshPage, check: rawCheck } = require('./harness');
const fx = require('./fixtures/golden-dataset');

const R = [];
const errorsAll = [];
function check(id, name, ok, info) { rawCheck(R, id, name, ok, info); }

function buildFixture() {
  const { H, L, supplierRow, invRow, mapRow, saleRow, poRow, monthsAgo, daysAgo, daysFromNow, fmt } = fx;
  const itemCodes = ['DT01', 'DT02', 'DT03', 'DT04', 'DT05'];
  const sales = [H.salesInvoices];
  for (let i = 6; i >= 1; i--) {
    sales.push(saleRow(100 + i, monthsAgo(i), 'DT01', 300));
    sales.push(saleRow(200 + i, monthsAgo(i), 'DT02', 600));
    sales.push(saleRow(300 + i, monthsAgo(i), 'DT03', 100));
    sales.push(saleRow(400 + i, monthsAgo(i), 'DT04', 200));
    sales.push(saleRow(500 + i, monthsAgo(i), 'DT05', 200));
  }
  const imports = [
    { source: 'suppliers', tsv: L([H.suppliers, supplierRow('DT-S1', 'مورد DET', 'TR', 18)]) },
    { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap,
      mapRow('DT01', 'DT-S1'), mapRow('DT02', 'DT-S1'), mapRow('DT03', 'DT-S1'), mapRow('DT04', 'DT-S1'), mapRow('DT05', 'DT-S1')]) },
    { source: 'inventory', tsv: L([H.inventory, invRow('DT01', 400), invRow('DT02', 100), invRow('DT03', 1000)]) },
    { source: 'purchaseOrders', tsv: L([H.purchaseOrders,
      poRow(1, daysAgo(30), daysFromNow(20), 'DT04', 'DT-S1', 500, 500),
      poRow(2, daysAgo(40), daysAgo(10), 'DT05', 'DT-S1', 500, 500)]) },
    { source: 'salesInvoices', tsv: L(sales) },
  ];
  const overrides = [{ key: 'PO_2_0', patch: { treatAsInTransit: true, expectedArrival: fmt(daysFromNow(5)) } }];
  return { imports, overrides, itemCodes };
}

async function runOnce(browser, fixture) {
  const { ctx, page } = await freshPage(browser);
  for (const step of fixture.imports) await page.imp(step.source, step.tsv);
  await page.refresh();
  for (const ov of fixture.overrides) await page.evaluate(({ key, patch }) => setDocOverride(key, patch), ov);
  if (fixture.overrides.length) await page.evaluate(() => { invalidateData(); STATE._recos = null; STATE._recosAll = null; });
  const snapshot = await page.evaluate((codes) => {
    return codes.map(code => {
      const x = RECO.computeForItem(code);
      return {
        ItemCode: x.ItemCode, status: x.status, stockStatus: x.stockStatus,
        monthlyDemand: x.monthlyDemand, coverageDays: x.coverageDays === Infinity ? 'INF' : x.coverageDays,
        neededQtyRaw: x.neededQtyRaw, recommendedQty: x.recommendedQty,
        leadTimeDays: x.leadTime.days, leadTimeSource: x.leadTime.source,
        supplierCode: x.supplier.code, incoming: x.incoming, unconfirmedIncoming: x.unconfirmedIncoming,
        confidence: x.confidence, priority: x.priority,
      };
    });
  }, fixture.itemCodes);
  // also capture the full sorted recommendation list's ItemCode order (RECO.allRecommendations()) —
  // proves sort stability, not just per-item field values.
  const order = await page.evaluate(() => RECO.allRecommendations().map(r => r.ItemCode));
  errorsAll.push(...page.errors);
  await ctx.close();
  return { snapshot, order };
}

async function main() {
  const browser = await launchBrowser();
  const fixture = buildFixture();

  console.log('[DET] Running identical input through two independent fresh contexts...');
  const run1 = await runOnce(browser, fixture);
  const run2 = await runOnce(browser, fixture);

  const s1 = JSON.stringify(run1.snapshot), s2 = JSON.stringify(run2.snapshot);
  check('DET-01', 'نفس المدخلات بالضبط بجلستين مستقلتين — نتائج RECO.computeForItem متطابقة حرفياً لكل صنف', s1 === s2, s1 === s2 ? 'identical' : `run1=${s1}\nrun2=${s2}`);

  const o1 = JSON.stringify(run1.order), o2 = JSON.stringify(run2.order);
  check('DET-02', 'نفس المدخلات — ترتيب RECO.allRecommendations() (الأولوية ثم الكمية) مستقر حرفياً بين التشغيلتين', o1 === o2, o1 === o2 ? 'identical' : `run1=${o1}\nrun2=${o2}`);

  // sanity: the snapshot isn't trivially empty/degenerate (would make the equality check vacuous)
  check('DET-03', 'اللقطة غير فارغة (فحص التطابق ليس تافهاً) — كل الأصناف الخمسة موجودة بكلتا التشغيلتين', run1.snapshot.length === fixture.itemCodes.length && run2.snapshot.length === fixture.itemCodes.length, `len1=${run1.snapshot.length} len2=${run2.snapshot.length}`);

  await browser.close();
  return { results: R, errors: errorsAll };
}

if (require.main === module) {
  main().then(({ results, errors }) => {
    const failed = results.filter(r => !r.ok);
    console.log('\n==================== DETERMINISM SUMMARY ====================');
    console.log('Tests:', results.length, '| Passed:', results.length - failed.length, '| Failed:', failed.length);
    failed.forEach(f => console.log('  FAILED [' + f.id + '] ' + f.name + ' ' + (f.info || '')));
    console.log('Console/page errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
    process.exit(failed.length || errors.length ? 1 : 0);
  }).catch(e => { console.error('FATAL', e); process.exit(2); });
} else {
  module.exports = { main };
}
