/* E2E suite — Foreign Procurement Intelligence screen.
   RECOVERY NOTE: this is a direct, faithful port of the meaningful UI/E2E flow that ran
   repeatedly throughout the engagement from a session-local scratch file (smoke.js, never
   committed). The scratch file still existed at port time — every step, selector and assertion
   below is recovered verbatim from it (same click paths, same fixture data, same checks), not
   reconstructed from memory. The only additions are: routing through the shared harness.js
   (mockSupabaseInitScript instead of an inline copy — same mocked client, same ADMIN/session
   defaults), a Test ID + category on every check for traceability, and a main()/module.exports
   wrapper so it can be invoked by run-all.js as well as directly with `node e2e.spec.js`.

   Unlike business-logic.spec.js, this suite drives the REAL upload UI (openImportModal → paste →
   preview → confirm) rather than IMPORT.mapRows directly — that is the point of an E2E suite:
   it exercises the modal, the click paths, sorting/filtering UI, drawers, print layouts, CSV
   export, responsive layout and IndexedDB reload exactly as a user would. It runs as ONE
   continuous session (data accumulates: upload → run engine → navigate → drill down → print →
   pilot review → reload) because each step depends on state built by the previous one — it is
   not decomposed into independent suites the way the business-logic checks are. */
'use strict';
const path = require('path');
const { launchBrowser, freshPage, APP_URL, L, check: rawCheck } = require('./harness');

const R = [];
const errorsAll = [];
let n = 0;
function check(name, ok, info) {
  n++;
  const id = 'E2E-' + String(n).padStart(2, '0');
  rawCheck(R, id, name, ok, info);
}

async function main() {
  const browser = await launchBrowser();
  const { ctx, page } = await freshPage(browser);

  /* 1. load */
  check('1. Load page — title', (await page.title()).includes('المشتريات الخارجية الذكية'));
  check('1b. Empty state opens Data Center', await page.$eval('nav.mainnav button.active', e => e.getAttribute('data-view')) === 'datacenter');

  /* 2. data center */
  check('2. Data Center cards = 14 (Phase 2: +physicalReturns/ORDN)', await page.$$eval('.dc-card', e => e.length) === 14, '' + await page.$$eval('.dc-card', e => e.length));
  check('2b. Health box shows level', (await page.$eval('#dcHealthBox', e => e.innerText)).includes('Data Health'));

  /* 3. uploads — through the real modal, not IMPORT.mapRows directly */
  async function importInto(k, tsv) {
    await page.evaluate(k => openImportModal(k), k);
    await page.fill('#importPasteArea', tsv);
    await page.click('#modalBox button:has-text("تحقق ومعاينة")');
    await page.waitForSelector('#modalBox button:has-text("تأكيد الاستيراد")');
    await page.click('#modalBox button:has-text("تأكيد الاستيراد")');
    await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'));
    await page.waitForTimeout(80);
  }
  await importInto('suppliers', L(["رمز المورد\tاسم المورد\tالبلد\tمدة التوريد", "S001\tمورد تركي\tTurkey\t30", "S002\tمورد مصري\tEgypt\t"]));
  await importInto('items', L(["رمز الصنف\tاسم الصنف\tمجموعة الصنف\tوحدة القياس\tوزن الوحدة", "CRIT01\tزيت ذرة 1ل\tزيوت\tكرتون\t12", "SOON01\tسكر 1كغ\tسكريات\tكيس\t1", "OVER01\tأرز 5كغ\tحبوب\tكيس\t5", "TRAN01\tطحين 25كغ\tحبوب\tكيس\t25", "STK01\tمعكرونة\tحبوب\tكرتون\t6"]));
  await importInto('inventory', L(["رمز الصنف\tالمستودع\tاسم المستودع\tالرصيد الحالي\tتحت الطلب", "CRIT01\t01\tرئيسي\t0\t0", "CRIT01\t004\tتالف\t40\t0", "SOON01\t01\tرئيسي\t150\t0", "OVER01\t01\tرئيسي\t5000\t0", "TRAN01\t01\tرئيسي\t10\t0", "STK01\t01\tرئيسي\t900\t0"]));
  await importInto('purchaseInvoices', L(["DocEntry\tDocNum\tLineNum\tتاريخ الاستلام\tرمز الصنف\tرمز المورد\tالمورد\tالكمية\tالسعر\tالمستودع\tBaseEntry",
    "1\t1\t0\t2025-11-01\tCRIT01\tS001\tمورد تركي\t500\t5\t01\t", "2\t2\t0\t2026-02-01\tCRIT01\tS001\tمورد تركي\t500\t5\t01\t",
    "3\t3\t0\t2026-01-01\tSOON01\tS001\tمورد تركي\t500\t5\t01\t", "4\t4\t0\t2026-01-01\tOVER01\tS002\tمورد مصري\t500\t5\t01\t",
    "5\t5\t0\t2026-01-01\tTRAN01\tS001\tمورد تركي\t1000\t5\t01\t", "6\t6\t0\t2026-01-01\tSTK01\tS002\tمورد مصري\t800\t5\t01\t"]));
  await importInto('purchaseOrders', L(["DocEntry\tDocNum\tLineNum\tتاريخ الأمر\tتاريخ التسليم\tرمز الصنف\tرمز المورد\tالمورد\tالكمية\tالمتبقي\tالحالة",
    "500\t500\t0\t2026-08-01\t2026-09-30\tTRAN01\tS001\tمورد تركي\t2000\t2000\tO", "501\t501\t0\t2026-06-01\t2026-07-15\tSOON01\tS001\tمورد تركي\t100\t100\tO"]));
  await importInto('goodsReceipts', L(["DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tرمز المورد\tالكمية\tالمستودع\tمرجع أمر الشراء\tمرجع سطر أمر الشراء", "600\t0\t2026-02-01\tCRIT01\tS001\t500\t01\t\t"]));
  await importInto('salesOrders', L(["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tرمز العميل\tالكمية\tالمفتوح\tالحالة", "700\t0\t2026-09-01\tCRIT01\tC1\t80\t80\tO"]));
  await importInto('salesQuotations', L(["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tرمز العميل\tالكمية\tالمفتوح", "800\t0\t2026-09-02\tCRIT01\tC2\t100\t100"]));
  await importInto('batches', L(["رمز الصنف\tالباتش\tالمستودع\tتاريخ الإدخال\tتاريخ الإنتاج\tتاريخ الانتهاء\tكمية الباتش\tكلفة الوحدة\tالمورد", "OVER01\tB1\t01\t2026-01-01\t2025-12-01\t2026-09-01\t200\t5\tمورد مصري", "OVER01\tB2\t01\t2026-01-01\t2025-12-01\t2026-10-01\t300\t5\tمورد مصري", "SOON01\tB3\t01\t2026-01-01\t2025-12-01\t2027-06-01\t150\t5\tمورد تركي"]));
  const rows = ["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tاسم الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tمندوب المبيعات\tالمبلغ\tملغى"]; let de = 100;
  const months = ['2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10'];
  months.forEach((d, i) => {
    rows.push(`${de++}\t0\t${d}\tCRIT01\tزيت ذرة 1ل\t300\t01\tC1\tعميل الأول\tمندوب أ\t1500\tN`);
    rows.push(`${de++}\t0\t${d}\tCRIT01\tزيت ذرة 1ل\t100\t011\tC9\tالمؤسسة العسكرية\tمندوب ب\t500\tN`);
    rows.push(`${de++}\t0\t${d}\tSOON01\tسكر 1كغ\t300\t01\tC2\tعميل الثاني\tمندوب أ\t1500\tN`);
    rows.push(`${de++}\t0\t${d}\tOVER01\tأرز 5كغ\t50\t01\tC1\tعميل الأول\tمندوب أ\t250\tN`);
    rows.push(`${de++}\t0\t${d}\tTRAN01\tطحين 25كغ\t400\t01\tC3\tعميل الثالث\tمندوب ب\t2000\tN`);
    rows.push(`${de++}\t0\t${d}\tSTK01\tمعكرونة\t${i === 6 ? 15 : 300}\t01\tC2\tعميل الثاني\tمندوب أ\t900\tN`);
  });
  rows.push(`${de++}\t0\t2026-05-05\tCRIT01\tزيت ذرة 1ل\t999\t01\tC1\tعميل الأول\tمندوب أ\t1\tY`); // canceled must be ignored
  await importInto('salesInvoices', rows.join('\n'));
  await importInto('salesReturns', L(["DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tالمبلغ\tملغى", "900\t0\t2026-02-12\tCRIT01\t50\t01\tC1\tعميل الأول\t250\tN"]));
  check('3. Uploads — sources loaded', await page.$$eval('[id^=dcLoaded_] .badge.green', e => e.length) >= 10, '' + await page.$$eval('[id^=dcLoaded_] .badge.green', e => e.length));
  check('3b. Baseline strip shows 2026 updated', (await page.$eval('#view-datacenter', e => e.innerText)).includes('2026 محدَّث'));

  /* 4. run engine */
  await page.click('.ctxbar button:has-text("تشغيل المحرك")');
  await page.waitForFunction(() => document.querySelector('.ctxbar .btn-primary').textContent.includes('تشغيل المحرك'));
  check('4. Run engine — context bar period + health', (await page.$eval('#ctxPeriod', e => e.textContent)).includes('→') && (await page.$eval('#ctxHealth', e => e.textContent)).length > 2, await page.$eval('#ctxHealth', e => e.textContent));

  /* 5. command center */
  await page.click('nav.mainnav button[data-view="decisions"]');
  await page.waitForSelector('#decisionsTable table');
  const cells = await page.$$eval('.sum-cell', e => e.map(x => x.querySelector('.k').textContent.trim() + '=' + x.querySelector('.n').textContent.trim()));
  console.log('   summary:', cells.join(' | '));
  const statuses = await page.evaluate(() => Object.fromEntries(getRecosAll().map(r => [r.ItemCode, r.status])));
  console.log('   statuses:', JSON.stringify(statuses));
  check('5. Command center — CRIT01 critical, SOON01 soon, OVER01 overstock, TRAN01 in transit', statuses.CRIT01 === 'CRITICAL' && statuses.SOON01 === 'ORDER_SOON' && statuses.OVER01 === 'OVERSTOCK' && statuses.TRAN01 === 'IN_TRANSIT');
  check('5b. Summary strip clickable → plan tab', await page.evaluate(() => { document.querySelectorAll('.sum-cell')[4].click(); return document.querySelector('nav.mainnav button.active').getAttribute('data-view') === 'plan' && STATE.planTab === 'OVERSTOCK'; }));
  await page.click('nav.mainnav button[data-view="decisions"]');

  /* 6. table columns */
  const heads = await page.$$eval('#decisionsTable thead th', e => e.map(x => x.textContent.replace(/[⇅▲▼]/g, '').trim()));
  console.log('   columns:', heads.join(' | '));
  check('6. Recommendation table columns', ['الأولوية', 'رمز الصنف', 'اسم الصنف', 'المورد', 'المتاح', 'الطلب الشهري المعدَّل', 'أوامر بيع مفتوحة', 'بالطريق', 'مدة التوريد', 'الكمية الموصى بها', 'الوحدة', 'الوصول المتوقع', 'الثقة'].every(c => heads.includes(c)));
  const firstRow = await page.$eval('#decisionsTable tbody tr', e => e.innerText.replace(/\t/g, ' | '));
  console.log('   row1:', firstRow);
  check('6b. UOM & arrival date shown', /كرتون|كيس/.test(firstRow) && /2026-/.test(firstRow));

  /* 7. sorting 3-state */
  const thAvail = () => page.$('#decisionsTable thead th:has-text("المتاح")');
  const firstAvail = async () => page.$eval('#decisionsTable tbody tr td:nth-child(6)', e => e.textContent.trim());
  await (await thAvail()).click(); const s1 = await page.$eval('#decisionsTable thead th:has-text("المتاح") .si', e => e.textContent); const a1 = await firstAvail();
  await (await thAvail()).click(); const s2 = await page.$eval('#decisionsTable thead th:has-text("المتاح") .si', e => e.textContent); const a2 = await firstAvail();
  await (await thAvail()).click(); const s3 = await page.$eval('#decisionsTable thead th:has-text("المتاح") .si', e => e.textContent);
  check('7. Sorting desc→asc→none with indicator', s1 === '▼' && s2 === '▲' && s3 === '⇅' && a1 !== a2, `${s1}${s2}${s3} ${a1}/${a2}`);

  /* 8. filtering */
  await page.click('#btnFilters');
  await page.waitForSelector('#filtersInner select#f_supplier');
  await page.selectOption('#f_supplier', 'S002');
  await page.click('#filtersInner button:has-text("تطبيق")');
  await page.waitForTimeout(150);
  const fc = await page.$eval('#filterCount', e => ({ t: e.textContent, h: e.hidden }));
  const rowsAfter = await page.$$eval('#decisionsTable tbody tr', e => e.length);
  const onlyS002 = await page.evaluate(() => getRecos().every(r => r.supplier.code === 'S002'));
  check('8. Filtering — supplier filter applied, count badge', fc.t === '1' && !fc.h && onlyS002, `rows=${rowsAfter}`);
  await page.click('#filtersInner button:has-text("مسح الفلاتر")');
  await page.waitForTimeout(150);
  check('8b. Clear filters', await page.$eval('#filterCount', e => e.hidden) && await page.evaluate(() => getRecos().length === 5));
  await page.click('#filtersInner button:has-text("إغلاق")');

  /* 9. why drawer */
  await page.evaluate(() => openWhyDrawer('CRIT01'));
  const why = await page.$eval('#modalBox', e => e.innerText);
  console.log('   why:', why.split('\n').slice(0, 4).join(' / '));
  check('9. Why drawer — facts + Arabic reason + qty + confidence', why.includes('سبب التوصية') && why.includes('المخزون المتاح') && /يغطي|منقطع/.test(why) && why.includes('الكمية الموصى بها') && why.includes('ثقة'));
  check('9b. Why — quotation weight & open SO used', why.includes('أوامر بيع مفتوحة') && why.includes('عروض أسعار'));
  await page.evaluate(() => closeModal());

  /* 10. item drawer */
  await page.evaluate(() => openItemDetail('TRAN01'));
  const item = await page.$eval('#drawerBox', e => e.innerText);
  check('10. Item drawer sections', ['التوصية', 'الطلب', 'المخزون', 'تاريخ الشراء', 'المورد', 'بالطريق', 'أوامر البيع', 'الباتشات'].every(s => item.includes(s)) && await page.$('#drawerBox svg.demand-svg') !== null);
  check('10b. In-transit PO shown with arrival', item.includes('500') && item.includes('2026-09-30'));
  await page.evaluate(() => openItemDetail('SOON01'));
  const hasDateInput = await page.$('#drawerBox input[type=date]');
  check('10c. Past-due PO shows expected-arrival input', !!hasDateInput);
  if (hasDateInput) {
    await hasDateInput.fill('2026-09-25'); await hasDateInput.dispatchEvent('change'); await page.waitForTimeout(200);
    const st = await page.evaluate(() => POTRACK.statusFor('SOON01')[0]);
    check('10d. Confirm in-transit persisted', st.inTransit === true && !st.needsUserDate);
  }
  await page.evaluate(() => closeDrawer());

  /* 11. supplier drawer */
  await page.evaluate(() => openSupplierDetail('S001'));
  const sup = await page.$eval('#drawerBox', e => e.innerText);
  check('11. Supplier drawer', sup.includes('مورد تركي') && sup.includes('Turkey') && sup.includes('مدة التوريد') && sup.includes('أمر الشراء المقترح') && sup.includes('نمط الشراء التاريخي'));
  await page.click('#drawerBox button:has-text("بناء أمر شراء لهذا المورد")');
  await page.waitForTimeout(200);
  check('11b. Build supplier order → plan view with groups', await page.evaluate(() => document.querySelector('nav.mainnav button.active').getAttribute('data-view') === 'plan' && !document.getElementById('planResult').hidden && document.querySelectorAll('#planGroups section.panel').length >= 1));

  /* 12. sales analysis */
  await page.click('nav.mainnav button[data-view="demand"]');
  await page.waitForSelector('#demandTable table');
  const dHeads = await page.$$eval('#demandTable thead th', e => e.map(x => x.textContent.replace(/[⇅▲▼]/g, '').trim()));
  check('12. Sales analysis table (months + average)', dHeads.includes('رمز الصنف') && dHeads.some(h => h.includes('2026')) && dHeads.includes('المتوسط / شهر'));
  const critFeb = await page.evaluate(() => { const r = getSalesReport().rows.find(x => x.ItemCode === 'CRIT01'); return r.monthly.get('2026-02').qty; });
  check('12b. Net sales (400 - 50 return, canceled ignored)', critFeb === 350, '' + critFeb);
  await page.click('#reportModeSeg button[data-m="both"]'); await page.waitForTimeout(100);
  check('12c. Toggle qty+amount', (await page.$eval('#demandTable', e => e.innerText)).includes('1,500'));

  /* 13. click month qty */
  await page.click('#reportModeSeg button[data-m="qty"]'); await page.waitForTimeout(100);
  const q = await page.$('#demandTable .qty-click'); await q.click(); await page.waitForTimeout(150);

  /* 14. drill-down */
  const dd = await page.$eval('#drawerBox', e => e.innerText);
  check('13/14. Customer drill-down opened, sorted desc', dd.includes('تفصيل العملاء') && dd.includes('رمز العميل') && dd.includes('%'));
  const firstQty = await page.$eval('#ddTable tbody tr td:nth-child(3)', e => e.textContent);
  await page.click('#ddTable thead th:has-text("الكمية الصافية")'); await page.waitForTimeout(80);
  await page.click('#ddTable thead th:has-text("الكمية الصافية")'); await page.waitForTimeout(80);
  const afterQty = await page.$eval('#ddTable tbody tr td:nth-child(3)', e => e.textContent);
  check('14b. Drill-down header sorting', firstQty !== afterQty || (await page.$$eval('#ddTable tbody tr', e => e.length)) === 1, `${firstQty}→${afterQty}`);
  await page.evaluate(() => printCustomerDrilldown()); await page.waitForTimeout(150);
  check('14c. Drill-down print layout', (await page.$eval('#printRoot', e => e.innerText)).includes('تفصيل العملاء'));
  await page.evaluate(() => closeDrawer());

  /* 15. purchase plan */
  await page.click('nav.mainnav button[data-view="plan"]');
  await page.waitForSelector('#planTable');
  await page.evaluate(() => { STATE.planTab = 'CRITICAL'; TABLES.plan(); });
  await page.click('#view-plan button:has-text("تحديد الكل")'); await page.waitForTimeout(80);
  const selCount = await page.evaluate(() => STATE.planSelection.size);
  await page.click('#view-plan button:has-text("بناء خطة الشراء حسب المورد")'); await page.waitForTimeout(150);
  const planTxt = await page.$eval('#planGroups', e => e.innerText);
  check('15. Purchase plan grouped by supplier with totals', planTxt.includes('إجمالي أمر الشراء') && planTxt.includes('مورد تركي') && planTxt.includes('طن'), `selected=${selCount}`);
  const qtyInput = await page.$('#planTable input.cell-input');
  // P1-B: a reasonCategory is now mandatory before an override-quantity edit is saved — select
  // one in the same row first, otherwise the edit below is correctly rejected and this check
  // would fail for the wrong reason (missing precondition, not a real regression).
  const qtyRow = await qtyInput.evaluateHandle(el => el.closest('tr'));
  await qtyRow.asElement().$eval('select.cell-reason', el => { el.value = 'DATA_CORRECTION'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await qtyInput.fill('750'); await qtyInput.dispatchEvent('change'); await page.waitForTimeout(200);
  check('15b. Edit qty reflected in plan', (await page.$eval('#planGroups', e => e.innerText)).includes('750'));
  await page.click('#view-plan button:has-text("إلغاء تحديد الكل")'); await page.waitForTimeout(80);
  check('15c. Deselect all', await page.evaluate(() => getRecos().filter(r => r.status === STATE.planTab).every(r => !STATE.planSelection.has(r.ItemCode))));
  await page.click('#view-plan button:has-text("تحديد الكل")'); await page.waitForTimeout(80);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }).catch(() => null), page.click('#planResult button:has-text("تصدير CSV")')]);
  check('15d. CSV export triggers download', !!dl, dl ? dl.suggestedFilename() : 'no download');

  /* 16. print */
  await page.evaluate(() => window.__prints = 0);
  await page.click('#planResult button:has-text("طباعة خطة الشراء")'); await page.waitForTimeout(200);
  const pr = await page.$eval('#printRoot', e => e.innerText);
  check('16. Print purchase plan — dedicated layout', pr.includes('خطة الشراء المقترحة') && pr.includes('الفلاتر') && pr.includes('تاريخ الإصدار') && pr.includes('إجمالي أمر الشراء') && pr.includes('مركز الكيلاني'));
  await page.click('nav.mainnav button[data-view="decisions"]'); await page.waitForTimeout(100);
  await page.evaluate(() => window.__hold = true);
  await page.click('.ctxbar button:has-text("طباعة")'); await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  const vis = await page.evaluate(() => { const m = getComputedStyle(document.querySelector('main')).display; const p = getComputedStyle(document.getElementById('printRoot')).display; return { main: m, print: p, printing: document.body.classList.contains('printing') }; });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { window.__hold = false; window.dispatchEvent(new Event('afterprint')); });
  check('16b. In print media: UI hidden, print root visible', vis.print === 'block' && vis.main === 'none' && vis.printing, JSON.stringify(vis));
  check('16b2. After print: UI restored', await page.evaluate(() => !document.body.classList.contains('printing')));
  check('16c. window.print called', await page.evaluate(() => window.__prints) >= 2);
  await page.click('nav.mainnav button[data-view="demand"]'); await page.waitForTimeout(100);
  await page.click('.ctxbar button:has-text("طباعة")'); await page.waitForTimeout(200);
  check('16d. Sales analysis print-ready', (await page.$eval('#printRoot', e => e.innerText)).includes('تحليل الطلب والمبيعات'));

  /* 18. pilot review — log a buyer decision from the Why-drawer, then review/close/filter/export/print it */
  await page.click('nav.mainnav button[data-view="decisions"]'); await page.waitForTimeout(100);
  await page.evaluate(() => openWhyDrawer('CRIT01'));
  await page.click('#modalBox button:has-text("تسجيل قرار المشتري")');
  await page.fill('#pilotBuyerName', 'مشتري الاختبار');
  await page.selectOption('#pilotDecisionSel', 'DISAGREE_MORE');
  await page.fill('#pilotBuyerQty', '900');
  await page.fill('#pilotBuyerNote', 'الطلب الفعلي أعلى بسبب عيد قريب');
  await page.click('#modalBox button:has-text("حفظ السجل")');
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'));
  await page.waitForTimeout(80);
  check('18. Pilot log form: submit from Why-drawer creates one entry', await page.evaluate(() => PILOT.summary().total) === 1);

  await page.click('nav.mainnav button[data-view="pilot"]'); await page.waitForTimeout(120);
  const pilotRowTxt = await page.$eval('#pilotTable', e => e.innerText);
  check('18b. Pilot Review view lists the logged entry with buyer decision & status', pilotRowTxt.includes('CRIT01') && pilotRowTxt.includes('مخالف') && pilotRowTxt.includes('مفتوح'));

  await page.click('#pilotTable button:has-text("تفاصيل")');
  const pilotDetail = await page.$eval('#modalBox', e => e.innerText);
  check('18c. Pilot detail modal shows frozen recommendation snapshot + buyer note', pilotDetail.includes('لقطة توصية النظام') && pilotDetail.includes('عيد قريب'));
  await page.selectOption('#pilotStatusSelect', 'REVIEWED');
  await page.fill('#pilotReviewNote', 'تمت المراجعة من المدير');
  await page.click('#modalBox button:has-text("حفظ")');
  await page.waitForTimeout(80);
  check('18d. Status edit → REVIEWED with review note persisted', await page.evaluate(() => { const r = Object.values(STATE.pilotReviews)[0]; return r.status === 'REVIEWED' && r.reviewNote.includes('المدير'); }));

  const qtyBefore = await page.evaluate(() => Object.values(STATE.pilotReviews)[0].recommendation.recommendedQty);
  await page.click('#pilotTable button:has-text("تفاصيل")');
  await page.selectOption('#pilotStatusSelect', 'CLOSED');
  await page.click('#modalBox button:has-text("حفظ")');
  await page.waitForTimeout(80);
  check('18e. Status edit → CLOSED sets closedAt and never rewrites the frozen recommendation snapshot', await page.evaluate((qtyBefore) => { const r = Object.values(STATE.pilotReviews)[0]; return r.status === 'CLOSED' && !!r.closedAt && r.recommendation.recommendedQty === qtyBefore; }, qtyBefore));

  await page.selectOption('#pilotStatusFilter', 'OPEN'); await page.waitForTimeout(80);
  check('18f. Filter by status=OPEN hides the now-closed entry (empty state shown)', (await page.$eval('#pilotTable', e => e.innerText)).includes('لا توجد سجلات'));
  await page.selectOption('#pilotStatusFilter', ''); await page.waitForTimeout(80);

  const pilotSearch = await page.$('#pilotSearch'); await pilotSearch.fill('CRIT01'); await page.waitForTimeout(300);
  check('18g. Search filter by item code shows the matching entry', (await page.$eval('#pilotTable', e => e.innerText)).includes('CRIT01'));
  await pilotSearch.fill(''); await page.waitForTimeout(300);

  const [pilotDl] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }).catch(() => null), page.click('.view.active .actions button:has-text("تصدير CSV")')]);
  check('18h. Pilot Review CSV export triggers a download', !!pilotDl, pilotDl ? pilotDl.suggestedFilename() : 'no download');

  await page.evaluate(() => window.__prints = 0);
  await page.click('.view.active .actions button:has-text("طباعة")'); await page.waitForTimeout(200);
  check('18i. Pilot Review print-ready output', (await page.$eval('#printRoot', e => e.innerText)).includes('مراجعة الطيار'));

  check('18j. Logging/reviewing pilot entries never touched the recommendation engine result', await page.evaluate(() => { const r = RECO.computeForItem('CRIT01'); return r.available === 0 && r.physical === 40; }));

  /* 17. responsive (runs after pilot review in the original flow — order preserved) */
  for (const vp of [{ w: 1366, h: 768 }, { w: 1024, h: 768 }, { w: 820, h: 1100 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.click('nav.mainnav button[data-view="decisions"]'); await page.waitForTimeout(120);
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, nav: !!document.querySelector('nav.mainnav button.active'), tbl: document.querySelector('#decisionsTable .tbl-scroll').scrollWidth >= document.querySelector('#decisionsTable .tbl-scroll').clientWidth }));
    check(`17. Responsive ${vp.w}px — no page overflow`, ov.sw <= ov.cw + 1, JSON.stringify(ov));
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  /* extra: engine sanity */
  const crit = await page.evaluate(() => RECO.computeForItem('CRIT01'));
  check('X. CRIT01 available excludes damaged whs (0)', crit.available === 0 && crit.physical === 40);
  check('X. CRIT01 demand includes 011 military sales (≈400/mo)', Math.abs(crit.monthlyDemand - 400) < 1 || Math.abs(crit.monthlyDemand - 393.75) < 1, '' + crit.monthlyDemand);
  const stk = await page.evaluate(() => RECO.computeForItem('STK01'));
  console.log('   STK01:', stk.status, JSON.stringify(stk.demand.excludedMonths.map(e => e.month + ':' + (e.notExcluded ? 'kept' : 'excluded'))));

  /* persistence reload */
  await page.reload(); await page.waitForFunction(() => window.APP_READY === true);
  check('P. Data persists after reload (IndexedDB)', await page.evaluate(() => allKnownItemCodes().length === 5 && document.querySelector('nav.mainnav button.active').getAttribute('data-view') === 'decisions'));
  check('P2. Pilot Review entry persists after reload (IndexedDB)', await page.evaluate(() => { const rows = Object.values(STATE.pilotReviews); return rows.length === 1 && rows[0].status === 'CLOSED' && rows[0].buyerName === 'مشتري الاختبار'; }));

  errorsAll.push(...page.errors);
  await ctx.close();
  await browser.close();
  return { results: R, errors: errorsAll };
}

if (require.main === module) {
  main().then(({ results, errors }) => {
    const failed = results.filter(r => !r.ok);
    console.log('\n==================== E2E SUITE SUMMARY ====================');
    console.log('Tests:', results.length, '| Passed:', results.length - failed.length, '| Failed:', failed.length);
    failed.forEach(f => console.log('  FAILED [' + f.id + '] ' + f.name + ' ' + (f.info || '')));
    console.log('Console/page errors:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
    process.exit(failed.length || errors.length ? 1 : 0);
  }).catch(e => { console.error('FATAL', e); process.exit(2); });
} else {
  module.exports = { main };
}
