/* Decision Evidence suite (P0-B) — Foreign Procurement Intelligence screen.
   Tests the EVIDENCE module added in P0-B: decision identity, run grouping, actor capture,
   fingerprint determinism/sensitivity, historical immutability against future config changes,
   override handling, and failure behavior (never fabricate, never silently discard, never
   silently overwrite). Every test drives the real EVIDENCE module and real IndexedDB stores
   through harness.js — no mocking of the evidence layer itself.

   Per item 17 of the P0-B authorization: this suite is IN ADDITION to the 246 P0-A checks
   (business-logic/e2e/golden-dataset/data-validation/determinism), never a replacement for
   them. run-all.js runs both. */
'use strict';
const { launchBrowser, freshPage, check: rawCheck, L } = require('./harness');
const { H, supplierRow, invRow, mapRow, saleRow, piRow, monthsAgo } = require('./fixtures/golden-dataset');

const R = [];
const errorsAll = [];
function check(id, name, ok, info) { rawCheck(R, id, name, ok, info); }

async function withPage(browser, fn) {
  const { ctx, page } = await freshPage(browser);
  try { return await fn(page); } finally { errorsAll.push(...page.errors); await ctx.close(); }
}

/** Standard fixture: one item (DE01) with a bound supplier/lead time and stable 6-month demand,
    designed to land as a material (non-NO_ORDER) recommendation so evidence gets generated. */
async function importBaseline(page, item, opts) {
  opts = opts || {};
  await page.imp('suppliers', L([H.suppliers, supplierRow('S1', 'مورد DE', 'TR', opts.leadDays || 15)]));
  await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow(item, 'S1', '', opts.moq || '', opts.mult || '')]));
  await page.imp('inventory', L([H.inventory, invRow(item, opts.available != null ? opts.available : 50)]));
  const rows = [H.salesInvoices];
  for (let i = 6; i >= 1; i--) rows.push(saleRow(100 + i, monthsAgo(i), item, opts.demand || 300));
  await page.imp('salesInvoices', L(rows));
  await page.refresh();
}

async function runEvidence(page) {
  return page.evaluate(() => EVIDENCE.runForMaterialItems('test'));
}

async function main() {
  const browser = await launchBrowser();

  /* DE-01: Decision Identity — every field required by item 1 is present and well-formed. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE01');
    await runEvidence(page);
    const ev = await page.evaluate(() => EVIDENCE.latestForItem('DE01'));
    const ok = !!ev && !!ev.decisionId && !!ev.runId && ev.itemCode === 'DE01' && typeof ev.decisionTimestamp === 'number' && !!ev.actorId && ev.decisionType === 'RECOMMENDATION' && ev.decisionId === (ev.runId + '_DE01');
    check('DE-01', 'هوية القرار: decisionId/runId/itemCode/decisionTimestamp/actorId/decisionType كلها موجودة وصحيحة', ok, JSON.stringify(ev && { decisionId: ev.decisionId, runId: ev.runId, itemCode: ev.itemCode, actorId: ev.actorId, decisionType: ev.decisionType }));
  });

  /* DE-02: Determinism — same underlying business data across two separate runs (different
     runId, different timestamp) must produce the SAME fingerprint for the same item, because
     the fingerprint payload deliberately excludes runId/actorId/timestamp. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE02');
    const r1 = await runEvidence(page);
    const ev1 = await page.evaluate(() => EVIDENCE.latestForItem('DE02'));
    const r2 = await runEvidence(page); // nothing changed — identical business data
    const ev2 = await page.evaluate(() => EVIDENCE.latestForItem('DE02'));
    check('DE-02', 'حتمية البصمة: نفس البيانات عبر تشغيلين مختلفين (runId مختلف) ← نفس البصمة تماماً', r1.run.runId !== r2.run.runId && ev1.fingerprint === ev2.fingerprint, `run1=${r1.run.runId} run2=${r2.run.runId} fp1=${ev1.fingerprint} fp2=${ev2.fingerprint}`);
  });

  /* DE-03: Mutation — changing MOQ between runs must change the fingerprint. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE03', { moq: 100 });
    await runEvidence(page);
    const before = await page.evaluate(() => EVIDENCE.latestForItem('DE03'));
    await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow('DE03', 'S1', '', 500, '')]));
    await page.refresh();
    await runEvidence(page);
    const after = await page.evaluate(() => EVIDENCE.latestForItem('DE03'));
    check('DE-03', 'تحوّل MOQ بين تشغيلين ← بصمة مختلفة', before.fingerprint !== after.fingerprint, `before=${before.fingerprint} after=${after.fingerprint} moqBefore=${before.inputSnapshot.moq} moqAfter=${after.inputSnapshot.moq}`);
  });

  /* DE-04: Mutation — changing Order Multiple between runs must change the fingerprint. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE04', { mult: 50 });
    await runEvidence(page);
    const before = await page.evaluate(() => EVIDENCE.latestForItem('DE04'));
    await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow('DE04', 'S1', '', '', 250)]));
    await page.refresh();
    await runEvidence(page);
    const after = await page.evaluate(() => EVIDENCE.latestForItem('DE04'));
    check('DE-04', 'تحوّل مضاعف الطلب بين تشغيلين ← بصمة مختلفة', before.fingerprint !== after.fingerprint, `before=${before.fingerprint} after=${after.fingerprint} multBefore=${before.inputSnapshot.orderMultiple} multAfter=${after.inputSnapshot.orderMultiple}`);
  });

  /* DE-05: Mutation — changing demand (new sales data) between runs must change the fingerprint. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE05', { demand: 300 });
    await runEvidence(page);
    const before = await page.evaluate(() => EVIDENCE.latestForItem('DE05'));
    await page.imp('salesInvoices', L([H.salesInvoices, saleRow(999, monthsAgo(0), 'DE05', 5000)]));
    await page.refresh();
    await runEvidence(page);
    const after = await page.evaluate(() => EVIDENCE.latestForItem('DE05'));
    check('DE-05', 'تغيّر الطلب (بيانات مبيعات جديدة) بين تشغيلين ← بصمة مختلفة', before.fingerprint !== after.fingerprint, `before=${before.fingerprint} after=${after.fingerprint} demandBefore=${before.inputSnapshot.demandAdjusted} demandAfter=${after.inputSnapshot.demandAdjusted}`);
  });

  /* DE-06: Mutation — a supplier-resolution flip (new purchase-invoice majority) must change
     the fingerprint. */
  await withPage(browser, async (page) => {
    await page.imp('suppliers', L([H.suppliers, supplierRow('S1', 'مورد أول', 'TR', 15), supplierRow('S2', 'مورد ثانٍ', 'EG', 20)]));
    await page.imp('purchaseInvoices', L([H.purchaseInvoices, piRow(1, monthsAgo(6), 'DE06', 'S1', 'مورد أول', 100)]));
    await page.imp('inventory', L([H.inventory, invRow('DE06', 50)]));
    const rows = [H.salesInvoices];
    for (let i = 6; i >= 1; i--) rows.push(saleRow(100 + i, monthsAgo(i), 'DE06', 300));
    await page.imp('salesInvoices', L(rows));
    await page.refresh();
    await runEvidence(page);
    const before = await page.evaluate(() => EVIDENCE.latestForItem('DE06'));
    await page.imp('purchaseInvoices', L([H.purchaseInvoices, piRow(2, monthsAgo(5), 'DE06', 'S2', 'مورد ثانٍ', 500)]));
    await page.refresh();
    await runEvidence(page);
    const after = await page.evaluate(() => EVIDENCE.latestForItem('DE06'));
    check('DE-06', 'تحوّل المورد المُختار (أغلبية جديدة) بين تشغيلين ← بصمة مختلفة', before.inputSnapshot.supplier.code === 'S1' && after.inputSnapshot.supplier.code === 'S2' && before.fingerprint !== after.fingerprint, `supplierBefore=${before.inputSnapshot.supplier.code} supplierAfter=${after.inputSnapshot.supplier.code} fpBefore=${before.fingerprint} fpAfter=${after.fingerprint}`);
  });

  /* DE-07: Mutation — a changed recommended quantity (via changed available stock) must change
     the fingerprint. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE07', { available: 50 });
    await runEvidence(page);
    const before = await page.evaluate(() => EVIDENCE.latestForItem('DE07'));
    await page.imp('inventory', L([H.inventory, invRow('DE07', 5000)]));
    await page.refresh();
    await runEvidence(page);
    const after = await page.evaluate(() => EVIDENCE.latestForItem('DE07'));
    check('DE-07', 'تغيّر الكمية الموصى بها (تغيّر المخزون المتاح) بين تشغيلين ← بصمة مختلفة', before.outputSnapshot.recommendedQty !== after.outputSnapshot.recommendedQty && before.fingerprint !== after.fingerprint, `qtyBefore=${before.outputSnapshot.recommendedQty} qtyAfter=${after.outputSnapshot.recommendedQty} fpBefore=${before.fingerprint} fpAfter=${after.fingerprint}`);
  });

  /* DE-08: Canonical serialization is key-order independent — the exact mechanism that makes
     DE-02's cross-run determinism possible, tested in isolation. */
  await withPage(browser, async (page) => {
    const r = await page.evaluate(async () => {
      const a = { z: 1, a: { y: 2, x: [3, 2, 1] }, m: 'text' };
      const b = { a: { x: [3, 2, 1], y: 2 }, m: 'text', z: 1 }; // same content, different key order
      const sa = EVIDENCE.canonicalStringify(a), sb = EVIDENCE.canonicalStringify(b);
      const ha = await EVIDENCE.sha256Hex(sa), hb = await EVIDENCE.sha256Hex(sb);
      return { sa, sb, ha, hb };
    });
    check('DE-08', 'التمثيل القانوني (canonicalStringify) مستقل عن ترتيب إدخال المفاتيح — نفس المحتوى ← نفس السلسلة ← نفس البصمة', r.sa === r.sb && r.ha === r.hb, JSON.stringify(r));
  });

  /* DE-09: Actor identity is captured correctly from the authenticated session (the harness's
     mocked ADMIN session: id 'test-user-id', profile full_name 'Test ADMIN'). */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE09');
    await runEvidence(page);
    const ev = await page.evaluate(() => EVIDENCE.latestForItem('DE09'));
    check('DE-09', 'هوية الفاعل المصادَق عليه تُلتقط بصحّة (actorId/actorName من الجلسة الفعلية)', ev.actorId === 'test-user-id' && ev.actorName === 'Test ADMIN', JSON.stringify({ actorId: ev.actorId, actorName: ev.actorName }));
  });

  /* DE-10: Missing identity is explicitly represented as IDENTITY_UNAVAILABLE, never fabricated. */
  await withPage(browser, async (page) => {
    const r = await page.evaluate(() => { const saved = curUser; curUser = null; const snap = EVIDENCE.actorSnapshot(); curUser = saved; return snap; });
    check('DE-10', 'هوية فاعل غير متوفرة (curUser=null) ← IDENTITY_UNAVAILABLE صراحةً، لا اختلاق هوية', r.actorId === 'IDENTITY_UNAVAILABLE' && r.actorName === 'IDENTITY_UNAVAILABLE', JSON.stringify(r));
  });

  /* DE-11: Historical integrity — mutating CONFIG.tunable after a decision was recorded must
     NOT alter that decision's already-stored ruleVersion snapshot. The Internal Audit Test
     scenario from item 19, condensed into one assertion. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE11');
    const r1 = await runEvidence(page);
    const original = await page.evaluate(() => EVIDENCE.latestForItem('DE11'));
    const originalDecisionId = original.decisionId;
    await page.evaluate(() => { CONFIG.tunable.serviceBufferDays = 99; });
    const r2 = await runEvidence(page); // new run, new runId, under the mutated config
    const reread = await page.evaluate((id) => DB.getOne('decisionEvidence', id), originalDecisionId);
    const newEv = await page.evaluate(() => EVIDENCE.latestForItem('DE11'));
    const originalUnchanged = reread.ruleVersion.tunable.serviceBufferDays === 7 && reread.fingerprint === original.fingerprint;
    const newReflectsChange = newEv.ruleVersion.tunable.serviceBufferDays === 99 && newEv.decisionId !== originalDecisionId;
    check('DE-11', 'سلامة تاريخية: تعديل CONFIG.tunable لاحقاً لا يغيّر الدليل التاريخي المخزَّن؛ القرار الجديد فقط يعكس الإعداد الجديد', originalUnchanged && newReflectsChange, JSON.stringify({ originalServiceBuffer: reread.ruleVersion.tunable.serviceBufferDays, newServiceBuffer: newEv.ruleVersion.tunable.serviceBufferDays, originalId: originalDecisionId, newId: newEv.decisionId }));
  });

  /* DE-12: Override preserves the original evidence untouched and records the override as a
     separate, linked event — never rewrites the original decision. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE12');
    await runEvidence(page);
    const original = await page.evaluate(() => EVIDENCE.latestForItem('DE12'));
    // P1-B: planSetQty now requires a reasonCategory (mandatory override reason) before it will
    // save anything — set one first so this test keeps exercising exactly what it always did
    // (override capture / original-decision immutability), unaffected by the reason requirement itself.
    await page.evaluate(() => { planSetReasonCategory('DE12', 'DATA_CORRECTION'); });
    await page.evaluate(() => { planSetQty('DE12', 777); });
    await page.waitForTimeout(100);
    const stillOriginal = await page.evaluate((id) => DB.getOne('decisionEvidence', id), original.decisionId);
    const overrides = await page.evaluate((id) => EVIDENCE.overridesForDecision(id), original.decisionId);
    const ok = stillOriginal.fingerprint === original.fingerprint && overrides.length === 1 && overrides[0].decisionId === original.decisionId && overrides[0].originalFingerprint === original.fingerprint && overrides[0].originalQty === original.outputSnapshot.recommendedQty && overrides[0].overrideQty === 777;
    check('DE-12', 'التجاوز (planSetQty) يحفظ القرار الأصلي دون تغيير ويُسجِّل حدث تجاوز منفصل مرتبط به', ok, JSON.stringify({ stillOriginalFp: stillOriginal.fingerprint, originalFp: original.fingerprint, overridesCount: overrides.length, override: overrides[0] }));
  });

  /* DE-12b: Override with no prior evidence (engine never run under P0-B for this item) is
     recorded as NO_PRIOR_EVIDENCE, not a fabricated original. */
  await withPage(browser, async (page) => {
    await page.imp('inventory', L([H.inventory, invRow('DE12B', 10)]));
    await page.refresh();
    await page.evaluate(() => { planSetReasonCategory('DE12B', 'DATA_CORRECTION'); }); // P1-B precondition
    await page.evaluate(() => { planSetQty('DE12B', 55); }); // requires 'input' permission — freshPage() defaults to ADMIN, which satisfies it
    await page.waitForTimeout(100);
    const ov = await page.evaluate(() => EVIDENCE.overridesForDecision(null));
    const mine = ov.find(o => o.itemCode === 'DE12B');
    check('DE-12b', 'تجاوز على صنف بلا دليل سابق ← NO_PRIOR_EVIDENCE صراحةً، لا اختلاق قرار أصلي', !!mine && mine.originalStatus === 'NO_PRIOR_EVIDENCE' && mine.originalFingerprint === null && mine.overrideQty === 55, JSON.stringify(mine));
  });

  /* DE-13: Reproducibility — the stored evidence contains sufficient fields to independently
     recompute the material calculation, not just the final answer. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE13', { available: 50, demand: 300, leadDays: 15 });
    await runEvidence(page);
    const ev = await page.evaluate(() => EVIDENCE.latestForItem('DE13'));
    const i = ev.inputSnapshot, m = ev.intermediateSnapshot;
    const recomputedDaily = i.demandAdjusted / 30.4368;
    const recomputedHorizon = i.leadTime.days + m.safetyStockDays;
    const recomputedTarget = recomputedDaily * recomputedHorizon + i.openSalesOrders + i.openQuotations * i.quotationWeight;
    const recomputedNet = Math.max(0, recomputedTarget - i.onHandAvailable - i.effectiveOnOrder);
    const matches = Math.abs(recomputedNet - m.netRequirement) < 0.01;
    check('DE-13', 'الدليل المخزَّن كافٍ لإعادة إنتاج الحساب الجوهري مستقلاً من الحقول المحفوظة وحدها', matches, `recomputedNet=${recomputedNet} storedNet=${m.netRequirement}`);
  });

  /* DE-14: Immutability guard — attempting to persist evidence under an already-used decisionId
     is rejected explicitly (throws), never silently overwrites. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE14');
    const r = await page.evaluate(async () => {
      const run = await EVIDENCE.startRun('test');
      const built1 = EVIDENCE.buildEvidenceForItem('DE14', run.runId, run.engineVersion, run.actorId, run.actorName);
      await EVIDENCE.persistEvidence(built1);
      let threw = false, msg = '';
      try {
        const built2 = EVIDENCE.buildEvidenceForItem('DE14', run.runId, run.engineVersion, run.actorId, run.actorName); // same runId+itemCode = same decisionId
        await EVIDENCE.persistEvidence(built2);
      } catch (e) { threw = true; msg = String(e && e.message || e); }
      return { threw, msg };
    });
    check('DE-14', 'محاولة كتابة نفس decisionId مرتين تُرفض صراحةً (استثناء) بدل الكتابة فوق الدليل التاريخي', r.threw && r.msg.includes('موجود مسبقاً'), JSON.stringify(r));
  });

  /* DE-15: Materiality — a NO_ORDER item (no demand, nothing to explain) does not get an
     evidence record; evidence generation doesn't blindly duplicate the entire dataset. */
  await withPage(browser, async (page) => {
    await page.imp('inventory', L([H.inventory, invRow('DE15', 0)])); // no sales, no demand at all → NO_ORDER
    await page.refresh();
    await runEvidence(page);
    const ev = await page.evaluate(() => EVIDENCE.latestForItem('DE15'));
    const status = await page.evaluate(() => RECO.computeForItem('DE15').status);
    check('DE-15', 'صنف NO_ORDER (لا طلب إطلاقاً) لا يحصل على سجل دليل — المادّية تستثني ما لا يستحق تفسيراً', status === 'NO_ORDER' && ev === null, `status=${status} evidenceFound=${!!ev}`);
  });

  /* DE-16: Backward compatibility at the call-site level — running evidence capture must not
     change the actual recommendation the engine produces (RECO.computeForItem before/after
     EVIDENCE.runForMaterialItems is byte-identical). */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'DE16');
    const before = await page.evaluate(() => JSON.stringify(RECO.computeForItem('DE16')));
    await runEvidence(page);
    const after = await page.evaluate(() => JSON.stringify(RECO.computeForItem('DE16')));
    check('DE-16', 'توليد دليل القرار لا يغيّر أي توصية فعلية — نتيجة RECO.computeForItem متطابقة حرفياً قبل/بعد', before === after, before === after ? 'identical' : `before=${before}\nafter=${after}`);
  });

  /* DE-17: Run grouping — one runEngine()-equivalent call groups all its material decisions
     under one shared runId, and a decisionRuns record exists summarizing it (distinguishing
     RUN from INDIVIDUAL DECISION, per item 2). */
  await withPage(browser, async (page) => {
    await page.imp('suppliers', L([H.suppliers, supplierRow('S1', 'مورد', 'TR', 15)]));
    await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow('DE17A', 'S1'), mapRow('DE17B', 'S1')]));
    await page.imp('inventory', L([H.inventory, invRow('DE17A', 10), invRow('DE17B', 10)]));
    const rows = [H.salesInvoices];
    for (let i = 6; i >= 1; i--) { rows.push(saleRow(200 + i, monthsAgo(i), 'DE17A', 300)); rows.push(saleRow(300 + i, monthsAgo(i), 'DE17B', 300)); }
    await page.imp('salesInvoices', L(rows));
    await page.refresh();
    const result = await runEvidence(page);
    const evA = await page.evaluate(() => EVIDENCE.latestForItem('DE17A'));
    const evB = await page.evaluate(() => EVIDENCE.latestForItem('DE17B'));
    const runRec = await page.evaluate((id) => DB.getOne('decisionRuns', id), result.run.runId);
    check('DE-17', 'تشغيل واحد يجمع كل القرارات الجوهرية تحت runId مشترك، وسجل decisionRuns يوثّق التشغيل نفسه منفصلاً عن كل قرار', evA.runId === evB.runId && evA.runId === result.run.runId && !!runRec && runRec.runId === result.run.runId, JSON.stringify({ runA: evA.runId, runB: evB.runId, resultRun: result.run.runId, runRecFound: !!runRec }));
  });

  await browser.close();
  return { results: R, errors: errorsAll };
}

if (require.main === module) {
  main().then(({ results, errors }) => {
    const failed = results.filter(r => !r.ok);
    console.log('\n==================== DECISION-EVIDENCE SUMMARY ====================');
    console.log('Tests:', results.length, '| Passed:', results.length - failed.length, '| Failed:', failed.length);
    failed.forEach(f => console.log('  FAILED [' + f.id + '] ' + f.name + ' ' + (f.info || '')));
    console.log('Console/page errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
    process.exit(failed.length || errors.length ? 1 : 0);
  }).catch(e => { console.error('FATAL', e); process.exit(2); });
} else {
  module.exports = { main };
}
