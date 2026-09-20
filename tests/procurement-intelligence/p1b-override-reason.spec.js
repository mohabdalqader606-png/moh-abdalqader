/* P1-B — Mandatory Override Reason suite. Tests the requirement added to planSetQty() in
   المشتريات_الخارجية_الذكية.html: every new quantity override must carry a `reasonCategory`
   (one of OVERRIDE_REASON_CATEGORIES), and `reasonCategory='OTHER'` additionally requires a
   non-empty `reasonComment`. Missing either required field must block the SAVE itself — both
   the actual override (STATE.planOverrides / the `planOverrides` IndexedDB store, i.e. what the
   supplier plan actually orders) and the EVIDENCE.captureOverride audit record — not merely
   suppress the audit trail while letting the quantity change through.

   Scope discipline: this suite tests ONLY the P1-B reason requirement. It does not re-test
   fingerprint/immutability mechanics already covered by decision-evidence.spec.js (whose DE-12/
   DE-12b now set a reasonCategory first, as a precondition fix, before calling planSetQty — see
   that file's comments), and does not touch P1-A/audit_access/RLS/Supabase in any way. */
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
  await page.imp('suppliers', L([H.suppliers, supplierRow('S1', 'مورد P1B', 'TR', 15)]));
  await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow(item, 'S1')]));
  if (opts.withInventory !== false) await page.imp('inventory', L([H.inventory, invRow(item, opts.available ?? 200)]));
  const rows = [H.salesInvoices];
  for (let i = 6; i >= 1; i--) rows.push(saleRow(300 + i, monthsAgo(i), item, opts.demand ?? 300));
  await page.imp('salesInvoices', L(rows));
  await page.refresh();
}
async function runEvidence(page) { return page.evaluate(() => EVIDENCE.runForMaterialItems('p1b-test')); }
async function overridesFor(page, itemCode) {
  return page.evaluate((code) => DB.getAll('decisionOverrides').then(all => all.filter(o => o.itemCode === code)), itemCode);
}
async function qtyOf(page, itemCode) { return page.evaluate((code) => (STATE.planOverrides[code] || {}).qty, itemCode); }

async function main() {
  const browser = await launchBrowser();

  /* ---- Category: missing reason rejected ---- */

  /* P1B-01: no reasonCategory set at all → planSetQty() is rejected — neither the actual
     override quantity (STATE.planOverrides / IndexedDB) nor a decisionOverrides audit record
     are created. This is the core "do not allow saving" requirement. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1B01');
    await runEvidence(page);
    await page.evaluate((code) => { planSetQty(code, 999); }, 'P1B01');
    await page.waitForTimeout(80);
    const qty = await qtyOf(page, 'P1B01');
    const overrides = await overridesFor(page, 'P1B01');
    check('P1B-01', 'بلا سبب تجاوز إطلاقاً ← الحفظ مرفوض كلياً (لا تعديل كمية فعلي، ولا سجل تدقيق)', qty === undefined && overrides.length === 0, JSON.stringify({ qty, overridesCount: overrides.length }));
  });

  /* ---- Category: OTHER without comment rejected ---- */

  /* P1B-02: reasonCategory='OTHER' but no reasonComment → also rejected, same guarantee. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1B02');
    await runEvidence(page);
    await page.evaluate((code) => { planSetReasonCategory(code, 'OTHER'); planSetQty(code, 999); }, 'P1B02');
    await page.waitForTimeout(80);
    const qty = await qtyOf(page, 'P1B02');
    const overrides = await overridesFor(page, 'P1B02');
    check('P1B-02', "التصنيف 'OTHER' بلا توضيح حر ← الحفظ مرفوض كلياً", qty === undefined && overrides.length === 0, JSON.stringify({ qty, overridesCount: overrides.length }));
  });

  /* P1B-02b: same as above but with an all-whitespace comment — must not count as "provided". */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1B02B');
    await runEvidence(page);
    await page.evaluate((code) => { planSetReasonCategory(code, 'OTHER'); planSetReasonComment(code, '   '); planSetQty(code, 999); }, 'P1B02B');
    await page.waitForTimeout(80);
    const qty = await qtyOf(page, 'P1B02B');
    const overrides = await overridesFor(page, 'P1B02B');
    check('P1B-02b', "التصنيف 'OTHER' وتوضيح كله فراغات (trim فارغ) ← يُعامَل كبلا توضيح، الحفظ مرفوض", qty === undefined && overrides.length === 0, JSON.stringify({ qty, overridesCount: overrides.length }));
  });

  /* ---- Category: valid standard reason accepted ---- */

  /* P1B-03: a standard (non-OTHER) reasonCategory → override saved: actual quantity persisted
     AND a decisionOverrides record captured with the exact reasonCategory, reasonComment=null. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1B03');
    await runEvidence(page);
    await page.evaluate((code) => { planSetReasonCategory(code, 'SUPPLIER_CONSTRAINT'); planSetQty(code, 850); }, 'P1B03');
    await page.waitForTimeout(80);
    const qty = await qtyOf(page, 'P1B03');
    const overrides = await overridesFor(page, 'P1B03');
    const ok = qty === 850 && overrides.length === 1 && overrides[0].reasonCategory === 'SUPPLIER_CONSTRAINT' && overrides[0].reasonComment === null && overrides[0].overrideQty === 850;
    check('P1B-03', 'سبب قياسي صالح (غير OTHER) ← الحفظ ينجح، والسجل يحمل التصنيف الصحيح بلا توضيح', ok, JSON.stringify({ qty, override: overrides[0] }));
  });

  /* ---- Category: OTHER with comment accepted ---- */

  /* P1B-04: reasonCategory='OTHER' WITH a non-empty reasonComment → accepted, both fields
     stored verbatim on the decisionOverrides record. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1B04');
    await runEvidence(page);
    await page.evaluate((code) => { planSetReasonCategory(code, 'OTHER'); planSetReasonComment(code, 'حالة استثنائية بطلب العميل مباشرة'); planSetQty(code, 720); }, 'P1B04');
    await page.waitForTimeout(80);
    const qty = await qtyOf(page, 'P1B04');
    const overrides = await overridesFor(page, 'P1B04');
    const ok = qty === 720 && overrides.length === 1 && overrides[0].reasonCategory === 'OTHER' && overrides[0].reasonComment === 'حالة استثنائية بطلب العميل مباشرة';
    check('P1B-04', "التصنيف 'OTHER' مع توضيح فعلي ← الحفظ ينجح، والتصنيف والتوضيح محفوظان حرفياً", ok, JSON.stringify({ qty, override: overrides[0] }));
  });

  /* ---- Category: historical overrides unchanged ---- */

  /* P1B-05: a decisionOverrides record shaped exactly like a pre-P1B record (no reasonCategory/
     reasonComment keys at all) must survive a real, valid NEW override on a DIFFERENT item
     completely untouched — no retroactive field injection, no rewrite. */
  await withPage(browser, async (page) => {
    const seeded = await page.evaluate(async () => {
      const rec = {
        overrideId: U.uid(), decisionId: 'OLDRUN_P1B05OLD', itemCode: 'P1B05OLD', overrideTimestamp: Date.now() - 86400000,
        actorId: 'old-actor', actorName: 'Old Actor', originalStatus: 'DECISION_FOUND',
        originalQty: 100, originalFingerprint: 'old-fingerprint-p1b05', overrideQty: 150, reason: 'ملاحظة قديمة حرة',
        // NOTE: deliberately NO reasonCategory/reasonComment keys — this is the pre-P1B shape.
      };
      await DB.putOne('decisionOverrides', rec);
      return rec;
    });
    await importBaseline(page, 'P1B05NEW');
    await runEvidence(page);
    await page.evaluate((code) => { planSetReasonCategory(code, 'DEMAND_SIGNAL'); planSetQty(code, 400); }, 'P1B05NEW');
    await page.waitForTimeout(80);
    const reread = await page.evaluate((id) => DB.getOne('decisionOverrides', id), seeded.overrideId);
    const ok = JSON.stringify(reread) === JSON.stringify(seeded) && !('reasonCategory' in reread) && !('reasonComment' in reread);
    check('P1B-05', 'سجل تجاوز قديم (بلا reasonCategory/reasonComment) يبقى كما هو تماماً بعد تجاوز جديد صالح على صنف آخر — بلا حقن حقول رجعي', ok, JSON.stringify({ unchanged: JSON.stringify(reread) === JSON.stringify(seeded) }));
  });

  /* ---- Category: existing override flow regression ---- */

  /* P1B-06: the full pre-P1B override guarantees (original decision's fingerprint untouched,
     override linked to the correct decisionId, originalQty/overrideQty correct) still hold
     exactly as decision-evidence.spec.js's DE-12 proved, now exercised under the new mandatory-
     reason precondition as a first-class P1-B concern in its own right. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1B06');
    await runEvidence(page);
    const original = await page.evaluate(() => EVIDENCE.latestForItem('P1B06'));
    await page.evaluate((code) => { planSetReasonCategory(code, 'MANAGEMENT_DECISION'); planSetQty(code, 777); }, 'P1B06');
    await page.waitForTimeout(80);
    const stillOriginal = await page.evaluate((id) => DB.getOne('decisionEvidence', id), original.decisionId);
    const overrides = await overridesFor(page, 'P1B06');
    const ok = stillOriginal.fingerprint === original.fingerprint
      && overrides.length === 1
      && overrides[0].decisionId === original.decisionId
      && overrides[0].originalFingerprint === original.fingerprint
      && overrides[0].originalQty === original.outputSnapshot.recommendedQty
      && overrides[0].overrideQty === 777
      && overrides[0].reasonCategory === 'MANAGEMENT_DECISION';
    check('P1B-06', 'مسار التجاوز الموجود أصلاً ما زال سليماً بالكامل تحت اشتراط السبب الجديد: القرار الأصلي بلا تغيير، والتجاوز مرتبط ومسجَّل بصحة كاملة', ok, JSON.stringify({ stillOriginalFp: stillOriginal.fingerprint, originalFp: original.fingerprint, override: overrides[0] }));
  });

  /* ---- Bonus: permission gate still runs before the reason gate (unchanged authorization) ---- */

  /* P1B-07: a VIEW-tier user is blocked at requirePermission('input', …) regardless of whether
     a reason was set — proves P1-B's addition did not change or bypass existing VIEW/INPUT/ADMIN
     authorization behavior (requirement 6), by placing the reason check strictly after it. */
  await withPage(browser, async (page) => {
    await importBaseline(page, 'P1B07');
    await runEvidence(page);
    await page.evaluate(() => { myPermission = 'view'; });
    await page.evaluate((code) => { planSetReasonCategory(code, 'DATA_CORRECTION'); planSetQty(code, 999); }, 'P1B07');
    await page.waitForTimeout(80);
    const qty = await qtyOf(page, 'P1B07');
    const overrides = await overridesFor(page, 'P1B07');
    check('P1B-07', 'حساب VIEW يُرفَض عند بوابة الصلاحية قبل بوابة السبب حتى، حتى لو كان السبب محدَّداً مسبقاً — سلوك VIEW/INPUT/ADMIN بلا تغيير', qty === undefined && overrides.length === 0, JSON.stringify({ qty, overridesCount: overrides.length }));
  });

  await browser.close();
  return { results: R, errors: errorsAll };
}

if (require.main === module) {
  main().then(({ results, errors }) => {
    const failed = results.filter(r => !r.ok);
    console.log('\n==================== P1-B SUMMARY ====================');
    console.log('Tests:', results.length, '| Passed:', results.length - failed.length, '| Failed:', failed.length);
    failed.forEach(f => console.log('  FAILED [' + f.id + '] ' + f.name + ' ' + (f.info || '')));
    console.log('Console/page errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
    process.exit(failed.length || errors.length ? 1 : 0);
  }).catch(e => { console.error('FATAL', e); process.exit(2); });
} else {
  module.exports = { main };
}
