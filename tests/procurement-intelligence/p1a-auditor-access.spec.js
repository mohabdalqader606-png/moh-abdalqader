/* P1-A — Auditor Access suite. Tests the orthogonal `audit_access` capability added to
   المشتريات_الخارجية_الذكية.html (myAuditAccess/hasAuditAccess(), the onSignedIn() query
   extension, the openDecisionEvidence() gate, and the runEngine() guard).

   Design correction surfaced during implementation (see the P1-A report): the schema's
   `permission NOT NULL CHECK (VIEW/INPUT/ADMIN)` means a persisted row can never have
   audit_access=true with no valid operational permission — the realistic minimum-privilege
   grant is permission='VIEW' + audit_access=true, not a "pure" permission=null state. Most
   checks below therefore use VIEW+audit_access=true as the "audit-only" case. The harness's
   mocked Supabase client (harness.js) does not model the audit_access column at all (by design
   — untouched per this phase's scope), so every check here sets `myAuditAccess` directly via
   page.evaluate() after sign-in, exactly like production code would after reading the real
   column. This is the self-contained approach the P1-A implementation plan called for instead
   of modifying harness.js.

   Scope discipline: this suite tests ONLY the P1-A additions. It does not re-test anything
   already covered by decision-evidence.spec.js (fingerprinting/immutability mechanics) or
   business-logic.spec.js/e2e.spec.js (login/permission-tier behavior unrelated to audit_access)
   — those remain the authority on their own areas, unchanged by this addition. */
'use strict';
const { launchBrowser, freshPage, authPage, check: rawCheck, L } = require('./harness');
const { H, supplierRow, invRow, mapRow, saleRow, monthsAgo } = require('./fixtures/golden-dataset');

const R = [];
const errorsAll = [];
function check(id, name, ok, info) { rawCheck(R, id, name, ok, info); }

async function withPage(browser, permission, fn) {
  const { ctx, page } = await freshPage(browser, { permission });
  try { return await fn(page); } finally { errorsAll.push(...page.errors); await ctx.close(); }
}

function setAudit(page, val) { return page.evaluate((v) => { myAuditAccess = v; }, val); }
function readState(page) {
  return page.evaluate(() => ({
    myPermission, myAuditAccess,
    hasAuditAccess: hasAuditAccess(), isAdmin: isAdmin(),
    hasView: hasPermission('view'), hasInput: hasPermission('input'), hasAdmin: hasPermission('admin'),
  }));
}
async function seedEvidence(page, itemCode) {
  return page.evaluate(async (code) => {
    const rec = {
      decisionId: 'P1A_' + code, runId: 'P1A_RUN', itemCode: code, decisionType: 'RECOMMENDATION',
      decisionTimestamp: Date.now(), actorId: 'seed-actor', actorName: 'Seed Actor',
      engineVersion: CONFIG.version, ruleVersion: { tunable: Object.assign({}, CONFIG.tunable) },
      inputSnapshot: { moq: null, orderMultiple: null, orderMultipleSource: null, leadTime: { days: 30, label: 'افتراضية' } },
      intermediateSnapshot: {},
      outputSnapshot: { status: 'NO_ORDER', recommendedQty: 0, priority: 9, confidence: 'LOW', supplier: null },
      fingerprint: 'p1a-seed-fingerprint',
    };
    await DB.putOne('decisionEvidence', rec);
    return rec;
  }, itemCode);
}
async function modalOpen(page, itemCode) {
  await page.evaluate(() => { document.getElementById('modalBox').innerHTML = ''; });
  await page.evaluate((code) => openDecisionEvidence(code), itemCode);
  return page.evaluate(() => document.getElementById('modalBox').innerHTML);
}

async function main() {
  const browser = await launchBrowser();

  /* ---- Category 1: audit_access=false (baseline — must be a strict no-op) ---- */

  /* P1A-01: fresh sign-in (any tier), audit_access column absent from the mocked row entirely
     (harness.js's mock never returns it) → myAuditAccess defaults to false, exactly the safe
     default the onSignedIn() extension is designed to produce for every pre-existing test in
     the whole suite that never sets it. */
  await withPage(browser, 'view', async (page) => {
    const s = await readState(page);
    check('P1A-01', 'افتراضياً (عمود audit_access غائب من صف الصلاحية) myAuditAccess=false، hasAuditAccess()=false', s.myAuditAccess === false && s.hasAuditAccess === false, JSON.stringify(s));
  });

  /* P1A-02: VIEW + audit_access=false (explicit) → openDecisionEvidence() denied exactly like
     before P1-A (modalBox untouched — the function returns before writing anything to it). */
  await withPage(browser, 'view', async (page) => {
    await setAudit(page, false);
    const html = await modalOpen(page, 'ANY');
    check('P1A-02', 'VIEW + audit_access=false ← دليل القرار مرفوض (السلوك القديم بلا تغيير)، modalBox لم يُمَس', html === '', 'modalBox.innerHTML=' + JSON.stringify(html));
  });

  /* ---- Category 3: audit-only evidence access ---- */

  /* P1A-03: VIEW + audit_access=true → openDecisionEvidence() proceeds past the gate (no prior
     evidence seeded here, so it reaches the "no evidence yet" empty-state — the point is that it
     is NOT the denied/untouched modalBox from P1A-02). */
  await withPage(browser, 'view', async (page) => {
    await setAudit(page, true);
    const html = await modalOpen(page, 'ANY');
    check('P1A-03', 'VIEW + audit_access=true ← دليل القرار يتجاوز بوابة الصلاحية (حالة "لا يوجد دليل بعد"، وليس رفضاً)', html.includes('empty-state') && !html.includes('drawer-body\"><div class="hint">جارٍ'), 'hasEmptyState=' + html.includes('empty-state'));
  });

  /* P1A-04: VIEW + audit_access=true, WITH a seeded evidence record → the actual evidence content
     renders (fingerprint/decisionId sections), proving audit-only access is not merely "doesn't
     crash" but genuinely functional. */
  await withPage(browser, 'view', async (page) => {
    await setAudit(page, true);
    await seedEvidence(page, 'P1A04');
    const html = await modalOpen(page, 'P1A04');
    check('P1A-04', 'VIEW + audit_access=true ← دليل قرار مسجَّل فعلياً يُعرَض بالكامل (بصمة SHA-256 ومعرّف القرار)', html.includes('p1a-seed-fingerprint') && html.includes('P1A_P1A04'), 'hasFingerprint=' + html.includes('p1a-seed-fingerprint'));
  });

  /* ---- Category 4: audit-only operational denial ---- */

  /* P1A-05: VIEW + audit_access=true → runEngine() is blocked by the new dedicated guard
     (myAuditAccess && !hasPermission('input')), never reaches invalidateData()/getRecosAll(). */
  await withPage(browser, 'view', async (page) => {
    await setAudit(page, true);
    const r = await page.evaluate(async () => {
      STATE._recosAll = null;
      await runEngine();
      return { stillNull: STATE._recosAll === null };
    });
    check('P1A-05', 'VIEW + audit_access=true ← تشغيل المحرك مرفوض صراحة، لم يُعِد الحساب إطلاقاً', r.stillNull, JSON.stringify(r));
  });

  /* P1A-06: VIEW + audit_access=true → planSetQty() (تعديل كمية الخطة) still denied — the
     'input'-level requirePermission() inside it is untouched by P1-A, and audit_access must
     never elevate it. */
  await withPage(browser, 'view', async (page) => {
    await setAudit(page, true);
    const r = await page.evaluate(async (code) => {
      const before = JSON.stringify(STATE.planOverrides[code] || null);
      planSetQty(code, 777);
      await new Promise(res => setTimeout(res, 30));
      const after = JSON.stringify(STATE.planOverrides[code] || null);
      return { before, after, unchanged: before === after };
    }, 'P1A06');
    check('P1A-06', 'VIEW + audit_access=true ← تعديل كمية الخطة (planSetQty) ما زال مرفوضاً، بلا تجاوز مسجَّل', r.unchanged, JSON.stringify(r));
  });

  /* P1A-07: VIEW + audit_access=true → lockHistoricalToggle() (قفل/فتح الأساس التاريخي) still
     admin-gated, untouched by P1-A. */
  await withPage(browser, 'view', async (page) => {
    await setAudit(page, true);
    const r = await page.evaluate(async () => {
      const before = await DB.getMeta('historicalLocked', false);
      await lockHistoricalToggle();
      const after = await DB.getMeta('historicalLocked', false);
      return { before, after, unchanged: before === after };
    });
    check('P1A-07', 'VIEW + audit_access=true ← قفل/فتح الأساس التاريخي ما زال مرفوضاً (ADMIN فقط)', r.unchanged, JSON.stringify(r));
  });

  /* P1A-08: VIEW + audit_access=true → updateTunable() (تعديل إعدادات المحرك) still admin-gated. */
  await withPage(browser, 'view', async (page) => {
    await setAudit(page, true);
    const r = await page.evaluate(async () => {
      const before = CONFIG.tunable.quotationWeight;
      await updateTunable('quotationWeight', before + 0.5);
      const after = CONFIG.tunable.quotationWeight;
      return { before, after, unchanged: before === after };
    });
    check('P1A-08', 'VIEW + audit_access=true ← تعديل إعدادات المحرك (updateTunable) ما زال مرفوضاً (ADMIN فقط)', r.unchanged, JSON.stringify(r));
  });

  /* ---- Category 5: admin + audit_access (must not regress admin's existing full access) ---- */

  /* P1A-09: ADMIN + audit_access=true → both openDecisionEvidence() (already allowed for admin
     pre-P1A) and runEngine() (never restricted for admin) keep working exactly as before; the
     new guard/gate must be a pure no-op for admin. */
  await withPage(browser, 'admin', async (page) => {
    await setAudit(page, true);
    await seedEvidence(page, 'P1A09');
    const evHtml = await modalOpen(page, 'P1A09');
    const engineRan = await page.evaluate(async () => {
      STATE._recosAll = null;
      await runEngine();
      return STATE._recosAll !== null;
    });
    check('P1A-09', 'ADMIN + audit_access=true ← دليل القرار وتشغيل المحرك يعملان بلا أي تغيير بالسلوك', evHtml.includes('p1a-seed-fingerprint') && engineRan, JSON.stringify({ evOk: evHtml.includes('p1a-seed-fingerprint'), engineRan }));
  });

  /* ---- Category 6: VIEW/INPUT/ADMIN regression (audit_access=false, and audit_access=true for
     tiers that already have real operational permission must not LOSE anything either) ---- */

  /* P1A-10: the three existing tiers keep their exact pre-P1A hasPermission()/isAdmin() truth
     table when audit_access=false (default) — a direct regression check for the change to
     onSignedIn()'s permission query. */
  await withPage(browser, 'view', async (page) => {
    const s = await readState(page);
    check('P1A-10a', 'VIEW (بلا audit_access): hasView=true, hasInput=false, hasAdmin=false, isAdmin=false — بلا تغيير', s.hasView === true && s.hasInput === false && s.hasAdmin === false && s.isAdmin === false, JSON.stringify(s));
  });
  await withPage(browser, 'input', async (page) => {
    const s = await readState(page);
    check('P1A-10b', 'INPUT (بلا audit_access): hasView=true, hasInput=true, hasAdmin=false, isAdmin=false — بلا تغيير', s.hasView === true && s.hasInput === true && s.hasAdmin === false && s.isAdmin === false, JSON.stringify(s));
  });
  await withPage(browser, 'admin', async (page) => {
    const s = await readState(page);
    check('P1A-10c', 'ADMIN (بلا audit_access): hasView=true, hasInput=true, hasAdmin=true, isAdmin=true — بلا تغيير', s.hasView === true && s.hasInput === true && s.hasAdmin === true && s.isAdmin === true, JSON.stringify(s));
  });

  /* P1A-13: INPUT + audit_access=true → runEngine() is NOT blocked. audit_access is purely
     additive (adds evidence-view capability) and must never take away operational access a user
     already has through their real permission tier — the runEngine() guard's specific condition
     (myAuditAccess && !hasPermission('input')) is false here because hasPermission('input') is
     already true, so the audit-only branch never fires. */
  await withPage(browser, 'input', async (page) => {
    await setAudit(page, true);
    const r = await page.evaluate(async () => {
      STATE._recosAll = null;
      await runEngine();
      return { ranOk: STATE._recosAll !== null };
    });
    check('P1A-13', 'INPUT + audit_access=true ← تشغيل المحرك يعمل عادي (audit_access لا يسحب صلاحية موجودة أصلاً)', r.ranOk, JSON.stringify(r));
  });

  /* ---- Category 2: audit_access=true + permission=null (schema-impossible edge case) ---- */

  /* P1A-11: this combination can never be persisted (permission is NOT NULL in the schema — see
     sql/user_permissions_batch5_auditor_access.sql's header note), but defensively: even if
     myAuditAccess were somehow true while myPermission is null (e.g. a stale in-memory value),
     the existing sign-out gate in onSignedIn() still fires purely off myPermission — unrelated
     to and unaffected by audit_access — and the runEngine() audit-only guard still denies
     because hasPermission('input') is false when myPermission is null. No new bypass exists. */
  await (async () => {
    const { ctx, page } = await authPage(browser, null);
    try {
      await page.waitForFunction(() => document.getElementById('loginMsg') && document.getElementById('loginMsg').textContent.length > 0, null, { timeout: 15000 });
      const deniedMsg = await page.evaluate(() => document.getElementById('loginMsg').textContent);
      await setAudit(page, true); // القيمة تبقى بالذاكرة رغم الرفض — نتحقق إنها لا تفتح أي ثغرة
      const s = await readState(page);
      const engineBlocked = await page.evaluate(async () => {
        const before = STATE._recosAll;
        await runEngine();
        return STATE._recosAll === before;
      });
      check('P1A-11', 'audit_access=true + permission=null (حالة مستحيلة بالسكيما): بوابة تسجيل الدخول ترفض كالمعتاد، وتشغيل المحرك يبقى مرفوضاً دفاعياً حتى لو myAuditAccess=true بالذاكرة', deniedMsg.length > 0 && s.myPermission === null && s.hasInput === false && engineBlocked, JSON.stringify({ deniedMsg, s, engineBlocked }));
    } finally { errorsAll.push(...page.errors); await ctx.close(); }
  })();

  /* ---- Category 7: historical evidence immutability under this specific change ---- */

  /* P1A-12: a decision evidence record seeded BEFORE any P1-A code runs must remain byte-for-byte
     untouched after a real ADMIN engine run — proving P1-A made zero writes to the evidence
     store (EVIDENCE.persistEvidence/buildEvidenceForItem were not touched by this phase at all). */
  await withPage(browser, 'admin', async (page) => {
    const seeded = await seedEvidence(page, 'P1A12OLD');
    await page.imp('suppliers', L([H.suppliers, supplierRow('S1', 'مورد P1A', 'TR', 15)]));
    await page.imp('itemSupplierMap', L([H.itemSupplierMap, mapRow('P1A12NEW', 'S1')]));
    await page.imp('inventory', L([H.inventory, invRow('P1A12NEW', 200)]));
    const rows = [H.salesInvoices];
    for (let i = 6; i >= 1; i--) rows.push(saleRow(200 + i, monthsAgo(i), 'P1A12NEW', 300));
    await page.imp('salesInvoices', L(rows));
    await page.refresh();
    await page.evaluate(() => runEngine());
    const reread = await page.evaluate((id) => DB.getOne('decisionEvidence', id), seeded.decisionId);
    check('P1A-12', 'سجل دليل قديم يبقى كما هو تماماً (نفس fingerprint ونفس decisionId) بعد تشغيل محرك حقيقي بعد P1-A', reread.decisionId === seeded.decisionId && reread.fingerprint === seeded.fingerprint, JSON.stringify({ fingerprintMatch: reread.fingerprint === seeded.fingerprint }));
  });

  /* ---- Category 8: direct function-level enforcement (white-box truth table) ---- */

  /* P1A-14: hasAuditAccess() reflects myAuditAccess exactly, independent of myPermission —
     confirms it is a genuinely orthogonal boolean, not derived from PERM_RANK at all. */
  await withPage(browser, 'view', async (page) => {
    const r = await page.evaluate(async () => {
      const out = [];
      for (const v of [true, false]) { myAuditAccess = v; out.push(hasAuditAccess() === v); }
      return out;
    });
    check('P1A-14', 'hasAuditAccess() تعكس myAuditAccess حرفياً (true/false) بمعزل عن myPermission', r.every(Boolean), JSON.stringify(r));
  });

  await browser.close();
  return { results: R, errors: errorsAll };
}

if (require.main === module) {
  main().then(({ results, errors }) => {
    const failed = results.filter(r => !r.ok);
    console.log('\n==================== P1-A SUMMARY ====================');
    console.log('Tests:', results.length, '| Passed:', results.length - failed.length, '| Failed:', failed.length);
    failed.forEach(f => console.log('  FAILED [' + f.id + '] ' + f.name + ' ' + (f.info || '')));
    console.log('Console/page errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
    process.exit(failed.length || errors.length ? 1 : 0);
  }).catch(e => { console.error('FATAL', e); process.exit(2); });
} else {
  module.exports = { main };
}
