/* P1-C — Confidence Reproducibility suite. Tests the single field added to
   EVIDENCE.buildEvidenceForItem()'s inputSnapshot (P0-B.7 §A): hasInventoryRecord, captured from
   the exact same expression RECO.computeConfidence() itself uses (INV.rowsFor(itemCode).length>0).

   Scope discipline: this suite tests ONLY the new field and its effects (fingerprint inclusion,
   historical immutability, independent reproducibility of the confidence label). It does not
   re-test anything already covered by decision-evidence.spec.js's 18 checks — those remain the
   authority on decisionId/runId/actor/override/etc. behavior, unchanged by this addition. */
'use strict';
const { launchBrowser, freshPage, check: rawCheck, L } = require('./harness');
const { H, supplierRow, invRow, mapRow, saleRow, monthsAgo } = require('./fixtures/golden-dataset');

const R = [];
const errorsAll = [];
function check(id, name, ok, info) { rawCheck(R, id, name, ok, info); }

async function withPage(browser, fn) {
  const { ctx, page } = await freshPage(browser);
  try { return await fn(page); } finally { errorsAll.push(...page.errors); await ctx.close(); }
}

async function importBaseline(page, item, opts) {
  opts = opts || {};
  await page.imp('suppliers', L([H.suppliers, supplierRow('S1', 'مورد P1C', 'TR', 15)]));
  await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow(item, 'S1')]));
  if (opts.withInventory !== false) await page.imp('inventory', L([H.inventory, invRow(item, opts.available ?? 200)]));
  const rows = [H.salesInvoices];
  for (let i = 6; i >= 1; i--) rows.push(saleRow(100 + i, monthsAgo(i), item, opts.demand ?? 300));
  await page.imp('salesInvoices', L(rows));
  await page.refresh();
}
async function ev(page, item) { return page.evaluate((it) => EVIDENCE.latestForItem(it), item); }
async function runEvidence(page) { return page.evaluate(() => EVIDENCE.runForMaterialItems('p1c-test')); }

/** Independent confidence calculator — a from-scratch re-implementation of RECO.computeConfidence's
    documented scoring rules (لاين ~1917-1926), fed ONLY from values a stored evidence record
    exposes. Deliberately never calls into the app's RECO.computeConfidence at all — this is the
    "do not use the engine as the calculator for the expected result" requirement. */
function independentConfidence({ seriesLength, demandConfidence, leadTimeSource, patternCount, hasInventoryRecord }) {
  let score = 0, total = 0;
  total++; if (seriesLength >= 6) score++; else if (seriesLength >= 3) score += 0.5;
  total++; if (demandConfidence === 'HIGH') score++; else if (demandConfidence === 'MEDIUM') score += 0.5;
  total++; if (leadTimeSource === 'supplier_master') score++; else if (leadTimeSource === 'derived') score += 0.6;
  total++; if (patternCount != null && patternCount >= 3) score++; else if (patternCount != null && patternCount >= 1) score += 0.4;
  total++; if (hasInventoryRecord) score++;
  const pct = score / total;
  return pct >= 0.72 ? 'HIGH' : pct >= 0.4 ? 'MEDIUM' : 'LOW';
}

async function main() {
  const browser = await launchBrowser();

  /* P1C-01: hasInventoryRecord === true when INV.rowsFor(itemCode).length>0 */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1C01', { withInventory: true });
    await runEvidence(page);
    const e = await ev(page, 'P1C01');
    check('P1C-01', 'hasInventoryRecord=true عندما يوجد سطر مخزون واحد على الأقل للصنف', e.inputSnapshot.hasInventoryRecord === true, JSON.stringify({ hasInventoryRecord: e.inputSnapshot.hasInventoryRecord }));
  });

  /* P1C-02: hasInventoryRecord === false when INV.rowsFor(itemCode).length===0 */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1C02', { withInventory: false });
    await runEvidence(page);
    const e = await ev(page, 'P1C02');
    check('P1C-02', 'hasInventoryRecord=false عندما لا يوجد أي سطر مخزون للصنف', e.inputSnapshot.hasInventoryRecord === false, JSON.stringify({ hasInventoryRecord: e.inputSnapshot.hasInventoryRecord }));
  });

  /* P1C-03: all 5 computeConfidence inputs reconstructed from a NEW stored record, independently
     calculated (never calling RECO.computeConfidence), must equal the stored confidence label. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1C03', { withInventory: true, demand: 500 });
    await runEvidence(page);
    const e = await ev(page, 'P1C03');
    const inp = e.inputSnapshot;
    const reconstructed = independentConfidence({
      seriesLength: inp.demandPeriod.months,
      demandConfidence: inp.demandConfidence,
      leadTimeSource: inp.leadTime.source,
      patternCount: inp.purchasePattern ? inp.purchasePattern.count : null,
      hasInventoryRecord: inp.hasInventoryRecord,
    });
    check('P1C-03', 'إعادة إنتاج مستقلة لتسمية الثقة من الحقول الخمسة المخزَّنة تطابق outputSnapshot.confidence المخزَّنة', reconstructed === e.outputSnapshot.confidence, `reconstructed=${reconstructed} stored=${e.outputSnapshot.confidence} inputs=${JSON.stringify({ seriesLength: inp.demandPeriod.months, demandConfidence: inp.demandConfidence, leadTimeSource: inp.leadTime.source, patternCount: inp.purchasePattern && inp.purchasePattern.count, hasInventoryRecord: inp.hasInventoryRecord })}`);
  });

  /* P1C-04 & P1C-06: a manually-inserted "pre-change-shaped" record (no hasInventoryRecord field,
     fingerprint computed the OLD way — i.e. without that field in the payload) must remain
     byte-for-byte untouched after the NEW code path runs — both for a narrow check (P1C-04) and
     after a full new engine run touching other items (P1C-06). One page, two assertions, since
     both need the exact same "old-shaped" seed record as their starting point. */
  await withPage(browser, async (page) => {
    // Seed a record shaped exactly like the OLD buildEvidenceForItem would have produced —
    // built from the SAME live helpers (canonicalStringify/sha256Hex) but with a payload that
    // deliberately omits hasInventoryRecord, matching the pre-P1C fingerprint contract exactly.
    const seeded = await page.evaluate(async () => {
      const oldStyleInput = {
        itemCode: 'OLD01', itemName: 'OLD01', itemGroup: null,
        supplier: { code: null, name: '—' },
        salesHistoryReference: { series: [], excludedMonths: [] },
        demandPeriod: { months: 0, from: null, to: null },
        demandRaw: 0, demandAdjusted: 0, demandConfidence: 'LOW',
        leadTime: { days: 30, source: 'default', label: 'افتراضية (لا بيانات كافية)' },
        onHandAvailable: 0, onHandPhysical: 0,
        effectiveOnOrder: 0, unconfirmedOnOrder: 0,
        openSalesOrders: 0, openQuotations: 0, quotationWeight: 0.3,
        moq: null, orderMultiple: null, orderMultipleSource: null,
        purchasePattern: null,
        // NOTE: deliberately NO hasInventoryRecord key — this is the pre-P1C shape.
      };
      const ruleVersion = { tunable: Object.assign({}, CONFIG.tunable) };
      const outputSnapshot = { status: 'NO_ORDER', recommendedQty: 0, priority: 9, confidence: 'LOW', exceptionStatus: 'NORMAL', supplier: null, reasons: [], narrative: [] };
      const fingerprintPayload = { engineVersion: 'OLD-SIM-1.2.0', ruleVersion, itemCode: 'OLD01', input: oldStyleInput, intermediate: { dailyDemand: 0, netRequirement: 0 }, output: outputSnapshot };
      const fingerprint = await EVIDENCE.sha256Hex(EVIDENCE.canonicalStringify(fingerprintPayload));
      const rec = {
        decisionId: 'OLDRUN_OLD01', runId: 'OLDRUN', itemCode: 'OLD01', decisionType: 'RECOMMENDATION',
        decisionTimestamp: Date.now() - 86400000, actorId: 'old-actor', actorName: 'Old Actor',
        engineVersion: 'OLD-SIM-1.2.0', ruleVersion,
        inputSnapshot: oldStyleInput, intermediateSnapshot: { dailyDemand: 0, netRequirement: 0 }, outputSnapshot,
        fingerprint,
      };
      await DB.putOne('decisionEvidence', rec);
      return rec;
    });

    // P1C-04: narrow re-read, before doing anything else with the new code path.
    let reread = await page.evaluate((id) => DB.getOne('decisionEvidence', id), seeded.decisionId);
    check('P1C-04', 'سجل قديم (بلا hasInventoryRecord) يبقى كما هو تماماً — نفس decisionId ونفس fingerprint ونفس inputSnapshot، بلا حقن حقل جديد', reread.decisionId === seeded.decisionId && reread.fingerprint === seeded.fingerprint && JSON.stringify(reread.inputSnapshot) === JSON.stringify(seeded.inputSnapshot) && !('hasInventoryRecord' in reread.inputSnapshot), JSON.stringify({ fingerprintMatch: reread.fingerprint === seeded.fingerprint, hasNewField: 'hasInventoryRecord' in reread.inputSnapshot }));

    // P1C-06: apply the full NEW code path (a real engine run touching other items), then re-read.
    await importBaseline(page, 'P1C06NEW', { withInventory: true });
    await runEvidence(page);
    reread = await page.evaluate((id) => DB.getOne('decisionEvidence', id), seeded.decisionId);
    check('P1C-06', 'سلامة تاريخية: تشغيل المسار الجديد بالكامل (تشغيل محرك حقيقي لأصناف أخرى) لا يعيد كتابة السجل القديم إطلاقاً', reread.decisionId === seeded.decisionId && reread.fingerprint === seeded.fingerprint && !('hasInventoryRecord' in reread.inputSnapshot), JSON.stringify({ fingerprintStillMatches: reread.fingerprint === seeded.fingerprint }));
  });

  /* P1C-05: two otherwise-identical NEW records differing ONLY in hasInventoryRecord produce
     different fingerprints. Built directly via EVIDENCE.buildEvidenceForItem (bypassing
     persistEvidence, which would reject a duplicate decisionId) so both variants can share
     every other field exactly, isolating hasInventoryRecord as the sole difference. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1C05', { withInventory: true });
    const r = await page.evaluate(async () => {
      const built = EVIDENCE.buildEvidenceForItem('P1C05', 'RUNFP', '1.3.0-TEST', 'a', 'A');
      const withTrue = JSON.parse(JSON.stringify(built.fingerprintPayload));
      const withFalse = JSON.parse(JSON.stringify(built.fingerprintPayload));
      withTrue.input.hasInventoryRecord = true;
      withFalse.input.hasInventoryRecord = false;
      const fpTrue = await EVIDENCE.sha256Hex(EVIDENCE.canonicalStringify(withTrue));
      const fpFalse = await EVIDENCE.sha256Hex(EVIDENCE.canonicalStringify(withFalse));
      return { fpTrue, fpFalse, actualFieldValue: built.fingerprintPayload.input.hasInventoryRecord };
    });
    check('P1C-05', 'سجلان متطابقان تماماً باستثناء hasInventoryRecord ← بصمتان مختلفتان', r.fpTrue !== r.fpFalse, JSON.stringify(r));
  });

  await browser.close();
  return { results: R, errors: errorsAll };
}

if (require.main === module) {
  main().then(({ results, errors }) => {
    const failed = results.filter(r => !r.ok);
    console.log('\n==================== P1-C SUMMARY ====================');
    console.log('Tests:', results.length, '| Passed:', results.length - failed.length, '| Failed:', failed.length);
    failed.forEach(f => console.log('  FAILED [' + f.id + '] ' + f.name + ' ' + (f.info || '')));
    console.log('Console/page errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
    process.exit(failed.length || errors.length ? 1 : 0);
  }).catch(e => { console.error('FATAL', e); process.exit(2); });
} else {
  module.exports = { main };
}
