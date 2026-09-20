/* ==========================================================================================
   GOLDEN DATASET — 20 controlled reference scenarios for the Foreign Procurement Intelligence
   screen's recommendation engine (RECO.computeForItem) and sales-analysis report (buildSalesReport).

   THIS IS CONTROLLED TEST DATA, NOT PRODUCTION DATA. Every item code (GD01..GD20), supplier
   code, quantity and date below is synthetic, built specifically to isolate one documented
   business rule per scenario. None of it originates from — or represents — a real customer,
   supplier or transaction of مركز الكيلاني للأغذية.

   Each scenario's EXPECTED values are HAND-DERIVED from the engine's actual documented formula
   chain (read directly from المشتريات_الخارجية_الذكية.html at the time this file was written —
   see the file:line citations in each scenario's `math` field), not captured by running the
   app and recording whatever it happened to output. That distinction matters: a golden dataset
   that just snapshots current output would silently enshrine any existing bug as "expected"
   forever. Every number here was computed independently first; golden-dataset.spec.js then
   checks the live engine against it.

   The 20 scenarios mirror the "مواصفة البيانات المرجعية (Golden Dataset)" section of the Phase 1
   Big-4 audit report (audit_report.html §11) verbatim — same 20 cases, same "what it proves"
   framing — now built into concrete, executable fixtures instead of a paper spec.

   Formula chain reference (RECO.computeForItem, لاين 1912-2003):
     monthlyDemand   = max(demand.adjusted, 0)
     dailyDemand     = monthlyDemand / 30.4368
     coverageDays    = dailyDemand>0 ? available/dailyDemand : (available>0 ? Infinity : 0)
     hasDemand       = monthlyDemand>0 || openSO>0
     reorderPointDays= leadTime.days + CONFIG.tunable.serviceBufferDays   (default serviceBufferDays=7)
     horizonDemand   = dailyDemand*reorderPointDays + openSO + openQuotation(weighted)
     neededQtyRaw    = max(0, horizonDemand - available - incoming)
     recommendedQty  = neededQtyRaw>0 ? PURCHASE.roundToHistoricalMultiple(...) : 0
   Status priority chain (لاين 1945-1956): DEAD/OVERSTOCK stockStatus short-circuit first, then
   available<=0, then coverageDays<=7 (CRITICAL), then coverageDays<=21 (ORDER_SOON), then
   SLOW stockStatus, then recommendedQty>0 (ORDER_SOON), then !hasDemand (NO_ORDER), else MONITOR;
   MONITOR/NO_ORDER flip to STOCKOUT_RISK if a confirmed-stockout month was excluded from demand.
   ========================================================================================== */
'use strict';

const NOW = new Date();

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
/** N days from now (negative = past). Always safe (never lands on a boundary issue). */
function daysFromNow(n) { const d = new Date(NOW); d.setDate(d.getDate() + n); return d; }
function daysAgo(n) { return daysFromNow(-n); }
/** The 10th of the month N months before the current one — always in the past regardless of
    today's day-of-month, so monthly demand series never accidentally lands in the future. */
function monthsAgo(n) { return new Date(NOW.getFullYear(), NOW.getMonth() - n, 10); }
function L(rows) { return rows.join('\n'); }

/* ---- row builders (headers match the exact column aliases already proven against real SAP
   exports and the ported business-logic/e2e suites — see harness.js consumers) ---- */
const H = {
  suppliers: 'رمز المورد\tاسم المورد\tالبلد\tمدة التوريد',
  inventory: 'رمز الصنف\tالمستودع\tالرصيد الحالي',
  purchaseInvoices: 'DocEntry\tLineNum\tتاريخ الاستلام\tرمز الصنف\tرمز المورد\tالمورد\tالكمية',
  purchaseOrders: 'DocEntry\tLineNum\tتاريخ الأمر\tتاريخ التسليم\tرمز الصنف\tرمز المورد\tالكمية\tالمتبقي\tالحالة',
  salesInvoices: 'DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tاسم الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tالمبلغ\tملغى',
  salesReturns: 'DocEntry\tLineNum\tالتاريخ\tرمز الصنف\tالكمية\tالمستودع\tرمز العميل\tالعميل\tالمبلغ\tملغى',
  itemSupplierMap: 'رمز الصنف\tرمز المورد\tمفضّل؟\tالحد الأدنى\tمضاعف الطلب',
};
function supplierRow(code, name, country, leadDays) { return `${code}\t${name}\t${country}\t${leadDays == null ? '' : leadDays}`; }
function invRow(item, qty, whs) { return `${item}\t${whs || '01'}\t${qty}`; }
function piRow(de, date, item, supCode, supName, qty) { return `${de}\t0\t${fmt(date)}\t${item}\t${supCode}\t${supName}\t${qty}`; }
function poRow(de, orderDate, dueDate, item, supCode, qty, openQty, stat) { return `${de}\t0\t${fmt(orderDate)}\t${fmt(dueDate)}\t${item}\t${supCode}\t${qty}\t${openQty}\t${stat || 'O'}`; }
function saleRow(de, date, item, qty, whs, cust, custName, amt) { return `${de}\t0\t${fmt(date)}\t${item}\t${item}\t${qty}\t${whs || '01'}\t${cust || 'C1'}\t${custName || 'عميل اختبار'}\t${amt || qty * 5}\tN`; }
function returnRow(de, date, item, qty, whs, cust, custName, amt) { return `${de}\t0\t${fmt(date)}\t${item}\t${qty}\t${whs || '01'}\t${cust || 'C1'}\t${custName || 'عميل اختبار'}\t${amt || qty * 5}\tN`; }
function mapRow(item, sup, preferred, moq, mult) { return `${item}\t${sup}\t${preferred || ''}\t${moq == null ? '' : moq}\t${mult == null ? '' : mult}`; }

/** Six stable monthly sales rows (offsets 6..1 months back, all equal qty) — the standard
    "no outlier, no exclusion" demand series used by most scenarios below. */
function stableSixMonths(item, qty) {
  const rows = [H.salesInvoices];
  for (let i = 6; i >= 1; i--) rows.push(saleRow(100 + i, monthsAgo(i), item, qty));
  return L(rows);
}

const near = { near: true }; // marker helper not used directly — see spec's near(a,b,tol)

const SCENARIOS = [

  /* ===================================================================== GD-01 ===== */
  {
    id: 'GD-01', title: 'صنف طبيعي — المعادلة الأساسية الكاملة', itemCode: 'GD01',
    proves: 'Golden Dataset #1 (audit_report.html §11): المعادلة الأساسية الكاملة تعطي الرقم المتوقع تماماً.',
    math: `monthlyDemand=300 (6 مبيعات شهرية ثابتة، لا شذوذ). dailyDemand=300/30.4368=9.85649.
leadTime=20 (يدوي، supplier_master). reorderPointDays=27. horizonDemand=9.85649*27=266.1252.
available=400 → neededQtyRaw=max(0,266.1252-400)=0 → recommendedQty=0.
coverageDays=400/9.85649=40.582 (>21) → لا CRITICAL/ORDER_SOON. coverageMonths=400/300=1.33 (لا OVERSTOCK/SLOW) → status=MONITOR.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD01', 'TR', 20)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD01', 'S1')]) },
      { source: 'inventory', tsv: L([H.inventory, invRow('GD01', 400)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD01', 300) },
    ],
    expected: {
      intermediate: { monthlyDemand: 300, coverageDaysNear: [40.582, 0.5], leadTimeDays: 20, leadTimeSource: 'supplier_master' },
      final: { neededQtyRaw: 0, recommendedQty: 0 },
      decision: { status: 'MONITOR', stockStatus: 'NORMAL' },
    },
  },

  /* ===================================================================== GD-02 ===== */
  {
    id: 'GD-02', title: 'حركة سريعة — تغطية منخفضة ← CRITICAL', itemCode: 'GD02',
    proves: 'Golden Dataset #2: تغطية منخفضة ← CRITICAL صحيح.',
    math: `monthlyDemand=600, dailyDemand=19.71298. leadTime=15 → reorderPointDays=22.
available=100 → coverageDays=100/19.71298=5.0728 (<=7) → CRITICAL (لا توريد بالطريق).
horizonDemand=19.71298*22=433.6855 → neededQtyRaw=433.6855-100=333.6855.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD02', 'TR', 15)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD02', 'S1')]) },
      { source: 'inventory', tsv: L([H.inventory, invRow('GD02', 100)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD02', 600) },
    ],
    expected: {
      intermediate: { monthlyDemand: 600, coverageDaysNear: [5.0728, 0.3], leadTimeDays: 15 },
      final: { neededQtyRawNear: [333.6855, 2] },
      decision: { status: 'CRITICAL' },
    },
  },

  /* ===================================================================== GD-03 ===== */
  {
    id: 'GD-03', title: 'بطيء الحركة — SLOW_MOVING بدل MONITOR', itemCode: 'GD03',
    proves: 'Golden Dataset #3: SLOW_MOVING بدل MONITOR.',
    math: `monthlyDemand=50, available=200 → coverageMonths=200/50=4 (بين slowStockCoverageMonths=3 و overstockCoverageMonths=6) → stockStatus=SLOW.
coverageDays=200/1.64275=121.75 (>21) فلا يوقف عند CRITICAL/ORDER_SOON قبل الوصول لفحص SLOW → status=SLOW_MOVING.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD03', 'TR', 25)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD03', 'S1')]) },
      { source: 'inventory', tsv: L([H.inventory, invRow('GD03', 200)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD03', 50) },
    ],
    expected: {
      intermediate: { monthlyDemand: 50, coverageDaysNear: [121.75, 1] },
      final: {},
      decision: { status: 'SLOW_MOVING', stockStatus: 'SLOW' },
    },
  },

  /* ===================================================================== GD-04 ===== */
  {
    id: 'GD-04', title: 'راكد تماماً — DEAD، لا كمية موصى بها رغم وجود مخزون', itemCode: 'GD04',
    proves: 'Golden Dataset #4: DEAD ← لا كمية موصى بها رغم وجود مخزون منخفض.',
    math: `لا مبيعات إطلاقاً لـGD04 (أي فترة). INV.stockStatus: recentSaleMonths (آخر 6 أشهر حقيقية)=0 و available=80>0 → stockStatus=DEAD (يُعرض SLOW_MOVING بالواجهة — نفس تسمية SLOW، الحقل الداخلي stockStatus هو الفارق الحقيقي).
demand.adjusted=0 (لا سلسلة مبيعات إطلاقاً) → hasDemand=false → horizonDemand=0 → neededQtyRaw=0 → recommendedQty=0.`,
    imports: [
      { source: 'inventory', tsv: L([H.inventory, invRow('GD04', 80)]) },
    ],
    expected: {
      intermediate: { monthlyDemand: 0, demandRaw: 0, demandAdjusted: 0 },
      final: { neededQtyRaw: 0, recommendedQty: 0 },
      decision: { status: 'SLOW_MOVING', stockStatus: 'DEAD' },
    },
  },

  /* ===================================================================== GD-05 ===== */
  {
    id: 'GD-05', title: 'صنف جديد (<4 أشهر بيانات) — ثقة LOW تلقائياً، بلا كسر بالحساب', itemCode: 'GD05',
    proves: 'Golden Dataset #5: الثقة LOW تلقائياً، بلا كسر بالحساب.',
    math: `شهران فقط من البيانات (offsets 2,1) → dataMonths=2 < 4 → DEMAND.adjustedMonthlyDemand confidence='LOW' (لاين 1736: dataMonths>=9?...:dataMonths>=4?'MEDIUM':'LOW').
raw=adjusted=(100+120)/2=110 (لا شذوذ، شهرين فقط قريبين من بعض). leadTime بلا مورد مربوط → افتراضي 30 يوم.
لا كسر بالحساب: كل القيم يجب تكون أرقام محدودة (ليست NaN ولا Infinity).`,
    imports: [
      { source: 'inventory', tsv: L([H.inventory, invRow('GD05', 50)]) },
      { source: 'salesInvoices', tsv: L([H.salesInvoices, saleRow(1, monthsAgo(2), 'GD05', 100), saleRow(2, monthsAgo(1), 'GD05', 120)]) },
    ],
    expected: {
      intermediate: { demandRaw: 110, demandAdjusted: 110, demandSeriesLen: 2, demandConfidence: 'LOW', leadTimeSource: 'default', leadTimeDays: 30 },
      final: { finiteCheck: true },
      decision: {},
    },
  },

  /* ===================================================================== GD-06 ===== */
  {
    id: 'GD-06', title: 'صنف موسمي — يوثّق غياب أي معالجة موسمية', itemCode: 'GD06',
    proves: 'Golden Dataset #6: يوثّق غياب أي معالجة موسمية حالياً (فجوة معروفة، مو اختبار نجاح).',
    math: `سلسلة 8 أشهر بنمط موسمي واضح [150,180,200,350,320,280,160,140] (وسيط=190، كل النسب ضمن [0.35,2.6] فلا يُستبعد أي شهر).
adjusted = mean(الكل) = 1780/8 = 222.5 = نفس raw تماماً — يوثّق إن المحرك يستخدم متوسطاً مسطحاً بدون أي كشف/تعديل موسمي رغم النمط الواضح بالبيانات.`,
    imports: [
      { source: 'salesInvoices', tsv: L([H.salesInvoices,
        saleRow(1, monthsAgo(8), 'GD06', 150), saleRow(2, monthsAgo(7), 'GD06', 180), saleRow(3, monthsAgo(6), 'GD06', 200), saleRow(4, monthsAgo(5), 'GD06', 350),
        saleRow(5, monthsAgo(4), 'GD06', 320), saleRow(6, monthsAgo(3), 'GD06', 280), saleRow(7, monthsAgo(2), 'GD06', 160), saleRow(8, monthsAgo(1), 'GD06', 140)]) },
    ],
    expected: {
      intermediate: { demandRaw: 222.5, demandAdjusted: 222.5, demandSeriesLen: 8, demandExcludedCount: 0 },
      final: {}, decision: {},
    },
  },

  /* ===================================================================== GD-07 ===== */
  {
    id: 'GD-07', title: 'طلب متقطّع/خفيف — نفس معادلة المتوسط بلا نموذج مخصّص', itemCode: 'GD07',
    proves: 'Golden Dataset #7: يوثّق أن نفس معادلة المتوسط تُطبَّق بلا نموذج مخصّص للطلب المتقطّع.',
    math: `مبيعتان فقط ضمن نطاق 6 أشهر: 50 (قبل 6 أشهر) و40 (قبل شهر) — الأشهر الأربعة بينهما صفر (لا سطر مبيعات إطلاقاً بتلك الأشهر ضمن نطاق السلسلة).
مخزون كبير (1000) يضمن opening>0 بكل الأشهر بجدول monthlyAvailableTimeline، فالأشهر الصفرية (ratio=0<0.35) ما تنطبق عليها شروط "دليل انقطاع" (opening<=0 أو received<=0&&opening<median) → تبقى بالمتوسط (notExcluded).
mean = (50+0+0+0+0+40)/6 = 15 — يوثّق إن الصفريات تُحسب كما هي، بلا نموذج احتمالي/تجميعي مخصّص للطلب المتقطّع.`,
    imports: [
      { source: 'inventory', tsv: L([H.inventory, invRow('GD07', 1000)]) },
      { source: 'salesInvoices', tsv: L([H.salesInvoices, saleRow(1, monthsAgo(6), 'GD07', 50), saleRow(2, monthsAgo(1), 'GD07', 40)]) },
    ],
    expected: {
      intermediate: { demandRaw: 15, demandAdjusted: 15, demandSeriesLen: 6 },
      final: {}, decision: {},
    },
  },

  /* ===================================================================== GD-08 ===== */
  {
    id: 'GD-08', title: 'فائض مخزون — OVERSTOCK صحيح', itemCode: 'GD08',
    proves: 'Golden Dataset #8: OVERSTOCK صحيح عند تغطية > الحد المُعدّ.',
    math: `monthlyDemand=100, available=1000 → coverageMonths=1000/100=10 (>overstockCoverageMonths=6) → stockStatus=OVERSTOCK → status=OVERSTOCK (يقفز فوق كل فحوصات coverageDays).
horizonDemand=3.28550*27=88.708 → neededQtyRaw=max(0,88.708-1000)=0 → recommendedQty=0.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD08', 'TR', 20)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD08', 'S1')]) },
      { source: 'inventory', tsv: L([H.inventory, invRow('GD08', 1000)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD08', 100) },
    ],
    expected: {
      intermediate: { monthlyDemand: 100 },
      final: { neededQtyRaw: 0, recommendedQty: 0 },
      decision: { status: 'OVERSTOCK', stockStatus: 'OVERSTOCK' },
    },
  },

  /* ===================================================================== GD-09 ===== */
  {
    id: 'GD-09', title: 'خطر نفاد قادم — ORDER_SOON قبل الوصول لـCRITICAL', itemCode: 'GD09',
    proves: 'Golden Dataset #9: ORDER_SOON قبل الوصول لـCRITICAL.',
    math: `monthlyDemand=300, available=150 → coverageDays=150/9.85649=15.2184 (بين 7 و21 حصراً) → ORDER_SOON (لا CRITICAL لأنه >7).
horizonDemand=9.85649*27=266.1252 → neededQtyRaw=266.1252-150=116.1252.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD09', 'TR', 20)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD09', 'S1')]) },
      { source: 'inventory', tsv: L([H.inventory, invRow('GD09', 150)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD09', 300) },
    ],
    expected: {
      intermediate: { monthlyDemand: 300, coverageDaysNear: [15.2184, 0.3] },
      final: { neededQtyRawNear: [116.1252, 1] },
      decision: { status: 'ORDER_SOON' },
    },
  },

  /* ===================================================================== GD-10 ===== */
  {
    id: 'GD-10', title: 'أمر شراء مفتوح مستقبلي — يُحتسب "بالطريق" مؤكَّد تلقائياً', itemCode: 'GD10',
    proves: 'Golden Dataset #10: أمر شراء مفتوح مستقبلي يُحتسب "بالطريق" مؤكَّد تلقائياً (بلا أي تدخل يدوي).',
    math: `أمر شراء مفتوح بتاريخ تسليم مستقبلي (+20 يوم) → pastDue=false → inTransit=!pastDue=true تلقائياً (POTRACK.statusFor, لاين 1860-1862) → incoming=500.
monthlyDemand=200, leadTime=15 → reorderPointDays=22 → horizonDemand=6.57099*22=144.5618.
available=0, incoming=500 → neededQtyRaw=max(0,144.5618-0-500)=0 → available<=0&&hasDemand → (incoming>0&&neededQtyRaw<=0) → IN_TRANSIT.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD10', 'TR', 15)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD10', 'S1')]) },
      { source: 'purchaseOrders', tsv: L([H.purchaseOrders, poRow(1, daysAgo(30), daysFromNow(20), 'GD10', 'S1', 500, 500)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD10', 200) },
    ],
    expected: {
      intermediate: { monthlyDemand: 200, incoming: 500, unconfirmedIncoming: 0 },
      final: { neededQtyRaw: 0, recommendedQty: 0 },
      decision: { status: 'IN_TRANSIT' },
    },
  },

  /* ===================================================================== GD-11 ===== */
  {
    id: 'GD-11', title: 'أمر شراء متأخر بلا تاريخ وصول — لا يُحتسب بالقرار، "غير مؤكَّد"', itemCode: 'GD11',
    proves: 'Golden Dataset #11: أمر متأخر بلا تاريخ وصول لا يُحتسب بالقرار، ويظهر "غير مؤكَّد".',
    math: `أمر شراء مفتوح بتاريخ تسليم ماضٍ (-10 يوم)، بلا أي تأكيد يدوي → pastDue=true, needsUserDate=true, inTransit=false → incoming=0 (لا يُحتسب!)، unconfirmedIncoming=500.
horizonDemand=144.5618 (كما GD-10) → neededQtyRaw=max(0,144.5618-0-0)=144.5618 (incoming لا يُخصم لأنه غير مؤكد) → CRITICAL (available<=0&&hasDemand، ولا توريد مؤكد يُغلق الفجوة).`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD11', 'TR', 15)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD11', 'S1')]) },
      { source: 'purchaseOrders', tsv: L([H.purchaseOrders, poRow(1, daysAgo(40), daysAgo(10), 'GD11', 'S1', 500, 500)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD11', 200) },
    ],
    expected: {
      intermediate: { monthlyDemand: 200, incoming: 0, unconfirmedIncoming: 500 },
      final: { neededQtyRawNear: [144.5618, 1] },
      decision: { status: 'CRITICAL' },
    },
  },

  /* ===================================================================== GD-12 ===== */
  {
    id: 'GD-12', title: 'تأكيد وصول يدوي على أمر متأخر — ينتقل فوراً لمؤكَّد، يُخصم من الاحتياج', itemCode: 'GD12',
    proves: 'Golden Dataset #12: تأكيد وصول يدوي على أمر متأخر ينتقل فوراً لمؤكَّد ويُخصم من الاحتياج.',
    math: `نفس أساس GD-11 (أمر متأخر بلا تأكيد)، ثم setDocOverride({treatAsInTransit:true, expectedArrival:...}) — نفس المسار الحقيقي لزر "تأكيد الوصول" بالواجهة (لاين 2960).
بعد التأكيد: inTransit=true (treatAsInTransit)، needsUserDate=false (ov.expectedArrival موجود) → incoming=500, unconfirmedIncoming=0.
neededQtyRaw=max(0,144.5618-0-500)=0 → status ينتقل من CRITICAL إلى IN_TRANSIT فوراً.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD12', 'TR', 15)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD12', 'S1')]) },
      { source: 'purchaseOrders', tsv: L([H.purchaseOrders, poRow(1, daysAgo(40), daysAgo(10), 'GD12', 'S1', 500, 500)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD12', 200) },
    ],
    overrides: [{ key: 'PO_1_0', patch: { treatAsInTransit: true, expectedArrival: fmt(daysFromNow(5)) } }],
    expected: {
      intermediate: { monthlyDemand: 200, incoming: 500, unconfirmedIncoming: 0 },
      final: { neededQtyRaw: 0, recommendedQty: 0 },
      decision: { status: 'IN_TRANSIT' },
    },
  },

  /* ===================================================================== GD-13 ===== */
  {
    id: 'GD-13', title: 'صنف بلا مورد بفواتير الشراء ولا بملف الربط — "بدون مورد محدد"', itemCode: 'GD13',
    proves: 'Golden Dataset #13: "بدون مورد محدد" — سلوك صحيح موثَّق (لا فاتورة شراء ولا ربط يدوي).',
    math: `resolveSupplierForItem: لا صفوف purchaseInvoices لـGD13 ولا صفوف itemSupplierMap → {code:null, name:'—'} (لاين 1492-1506).
leadTimeDays(null,'GD13'): SUPPLIER.get(null)=undefined، لا LeadTimeDays بملف الصنف، لا تاريخ أمر شراء/استلام لاشتقاق مدة → افتراضي 30 يوم، source='default'.`,
    imports: [
      { source: 'inventory', tsv: L([H.inventory, invRow('GD13', 30)]) },
    ],
    expected: {
      intermediate: { supplierCode: null, leadTimeDays: 30, leadTimeSource: 'default' },
      final: {}, decision: {},
    },
  },

  /* ===================================================================== GD-14 ===== */
  {
    id: 'GD-14', title: 'صنف باثنين موردين، أحدهما مفضَّل — الأغلبية التاريخية أولاً دايماً', itemCode: 'GD14',
    proves: 'Golden Dataset #14: يُختار الأغلبية التاريخية أولاً دايماً، مو "المفضَّل" — يوثّق ترتيب الأولوية الفعلي.',
    math: `فاتورتا شراء فعليتان: S1 بكمية 100، S2 بكمية 500 — S2 هو الأغلبية بالكمية (500>100).
itemSupplierMap يضع S1 IsPreferred='Y' — لكن resolveSupplierForItem (لاين 1492-1501) يتحقق من purchaseInvoices أولاً ودائماً إن وُجدت أي فاتورة شراء، فلا يصل إطلاقاً لفحص itemSupplierMap/IsPreferred. النتيجة: S2 (الأغلبية)، رغم إن S1 "مفضّل" بالملف.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد أول GD14', 'TR', 10), supplierRow('S2', 'مورد ثانٍ GD14', 'EG', 10)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD14', 'S1', 'Y')]) },
      { source: 'purchaseInvoices', tsv: L([H.purchaseInvoices, piRow(1, monthsAgo(3), 'GD14', 'S1', 'مورد أول GD14', 100), piRow(2, monthsAgo(2), 'GD14', 'S2', 'مورد ثانٍ GD14', 500)]) },
    ],
    expected: {
      intermediate: { supplierCode: 'S2' },
      final: {}, decision: {},
    },
  },

  /* ===================================================================== GD-15 ===== */
  {
    id: 'GD-15', title: 'MOQ بلا مضاعف طلب رسمي — التقريب لأعلى MOQ', itemCode: 'GD15',
    proves: 'Golden Dataset #15: يتحقّق التقريب لأعلى MOQ صح (بلا مضاعف طلب، بلا نمط شراء تاريخي).',
    math: `itemSupplierMap: MOQ=200، مضاعف الطلب فارغ. لا فواتير شراء تاريخية لـGD15 → pattern=null → mult=0 (roundToHistoricalMultiple, لاين 1786).
monthlyDemand=100, leadTime=10 → reorderPointDays=17 → horizonDemand=3.28550*17=55.8534. available=0 → neededQtyRaw=55.8534 (>0، <MOQ).
mult=0 فيتخطى خطوة "ceil لأقرب مضاعف"، وبما إن qty(55.85)<moq(200) و mult=0 → qty=moq=200 مباشرة (لاين 1790) → recommendedQty=200 بالضبط.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD15', 'TR', 10)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD15', 'S1', '', 200, '')]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD15', 100) },
    ],
    expected: {
      intermediate: { monthlyDemand: 100 },
      final: { neededQtyRawNear: [55.8534, 1], recommendedQty: 200 },
      decision: {},
    },
  },

  /* ===================================================================== GD-16 ===== */
  {
    id: 'GD-16', title: 'مضاعف طلب بلا MOQ رسمي — الكمية الأكثر تكراراً تاريخياً كبديل صامت', itemCode: 'GD16',
    proves: 'Golden Dataset #16: يكشف استخدام "الكمية الأكثر تكراراً تاريخياً" كبديل صامت لمضاعف الطلب عند غياب القيمة الرسمية (فجوة توثيق موثَّقة، لا خطأ حسابي).',
    math: `تاريخ شراء فعلي [300,300,300,500] لنفس المورد S1 → pattern.mostCommon=300 (U.mode). لا itemSupplierMap إطلاقاً → map=undefined → mult=300 (من النمط، لا من إعداد رسمي)، moq=0.
monthlyDemand=400, leadTime=20 → reorderPointDays=27 → horizonDemand=13.14199*27=354.8336. available=0 → neededQtyRaw=354.8336.
mult=300>0 → qty=ceil(354.8336/300)*300=ceil(1.1828)*300=2*300=600 → recommendedQty=600 بالضبط، دون أي عمود "مضاعف طلب" رسمي مرفوع — التقريب اعتمد صامتاً على "الكمية الأكثر تكراراً تاريخياً".`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD16', 'TR', 20)]) },
      { source: 'purchaseInvoices', tsv: L([H.purchaseInvoices,
        piRow(1, monthsAgo(6), 'GD16', 'S1', 'مورد GD16', 300), piRow(2, monthsAgo(5), 'GD16', 'S1', 'مورد GD16', 300),
        piRow(3, monthsAgo(4), 'GD16', 'S1', 'مورد GD16', 300), piRow(4, monthsAgo(3), 'GD16', 'S1', 'مورد GD16', 500)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD16', 400) },
    ],
    expected: {
      intermediate: { monthlyDemand: 400, supplierCode: 'S1' },
      final: { neededQtyRawNear: [354.8336, 1], recommendedQty: 600 },
      decision: {},
    },
  },

  /* ===================================================================== GD-17 ===== */
  {
    id: 'GD-17', title: 'مدة توريد شاذة جداً (180+ يوم) — لا كسر بحساب أفق الطلب', itemCode: 'GD17',
    proves: 'Golden Dataset #17: يتحقّق عدم كسر حساب أفق الطلب مع مدة توريد شاذة جداً (200 يوم).',
    math: `leadTime=200 (يدوي، شاذ جداً) → reorderPointDays=207. monthlyDemand=100, dailyDemand=3.28550 → horizonDemand=3.28550*207=680.0978.
available=50 → neededQtyRaw=680.0978-50=630.0978 — رقم كبير لكن محدود (finite)، بلا NaN/Infinity، يثبت إن الحساب لا ينكسر مع مدخل متطرف.
coverageDays=50/3.28550=15.218 (بين 7،21) → ORDER_SOON.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD17', 'TR', 200)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD17', 'S1')]) },
      { source: 'inventory', tsv: L([H.inventory, invRow('GD17', 50)]) },
      { source: 'salesInvoices', tsv: stableSixMonths('GD17', 100) },
    ],
    expected: {
      intermediate: { leadTimeDays: 200, monthlyDemand: 100 },
      final: { neededQtyRawNear: [630.0978, 2], finiteCheck: true },
      decision: { status: 'ORDER_SOON' },
    },
  },

  /* ===================================================================== GD-18 ===== */
  {
    id: 'GD-18', title: 'تقلّب طلب شهري كبير — غياب انحراف معياري بمخزون الأمان (فجوة C-05)', itemCode: 'GD18',
    proves: 'Golden Dataset #18: يوثّق غياب انحراف معياري بحساب مخزون الأمان (فجوة C-05) رغم تقلّب طلب حقيقي كبير.',
    math: `سلسلة متقلبة [150,350,160,340,155,345] (لا شذوذ، كل النسب ضمن الحدود) → mean=250=adjusted (لا استبعاد).
رغم التذبذب الكبير (150↔350)، reorderPointDays يبقى leadTime+serviceBufferDays=15+7=22 بالضبط — رقم أيام ثابت (CONFIG.tunable.serviceBufferDays=7) لا علاقة له بتباين الطلب إطلاقاً؛ لا σ ولا مستوى خدمة إحصائي بأي مكان بالصيغة.
horizonDemand=8.21374*22=180.7023 → neededQtyRaw=180.7023-100=80.7023.`,
    imports: [
      { source: 'suppliers', tsv: L([H.suppliers, supplierRow('S1', 'مورد GD18', 'TR', 15)]) },
      { source: 'itemSupplierMap', tsv: L([H.itemSupplierMap, mapRow('GD18', 'S1')]) },
      { source: 'inventory', tsv: L([H.inventory, invRow('GD18', 100)]) },
      { source: 'salesInvoices', tsv: L([H.salesInvoices,
        saleRow(1, monthsAgo(6), 'GD18', 150), saleRow(2, monthsAgo(5), 'GD18', 350), saleRow(3, monthsAgo(4), 'GD18', 160),
        saleRow(4, monthsAgo(3), 'GD18', 340), saleRow(5, monthsAgo(2), 'GD18', 155), saleRow(6, monthsAgo(1), 'GD18', 345)]) },
    ],
    expected: {
      intermediate: { demandRaw: 250, demandAdjusted: 250, leadTimeDays: 15 },
      final: { neededQtyRawNear: [80.7023, 1] },
      decision: {},
    },
  },

  /* ===================================================================== GD-19 ===== */
  {
    id: 'GD-19', title: 'مرتجعات كبيرة بنفس الشهر — الصافي يُحتسب صح بالمتوسط', itemCode: 'GD19',
    proves: 'Golden Dataset #19: الصافي (فاتورة−مرتجع) يُحتسب صح بمتوسط الطلب الشهري.',
    math: `شهر1: فاتورة 500 + مرتجع 200 بنفس الشهر → صافي 300 (SALES.buildNetLines يبني سطر مرتجع بإشارة سالبة، لاين 1453-1465 — يُجمعان بنفس الشهر بـmonthlySeries).
شهر2،شهر3: فاتورة 300 بلا مرتجع → صافي 300 لكل منهما.
الثلاثة أشهر صافيها 300 بالضبط → raw=adjusted=300 (لا تباين، لا استبعاد) — يثبت إن المرتجعات تُخصم فعلياً من متوسط الطلب، مش تُتجاهل ولا تُطرح مرتين.`,
    imports: [
      { source: 'salesInvoices', tsv: L([H.salesInvoices,
        saleRow(1, monthsAgo(3), 'GD19', 500), saleRow(2, monthsAgo(2), 'GD19', 300), saleRow(3, monthsAgo(1), 'GD19', 300)]) },
      { source: 'salesReturns', tsv: L([H.salesReturns, returnRow(1, monthsAgo(3), 'GD19', 200)]) },
    ],
    expected: {
      intermediate: { demandRaw: 300, demandAdjusted: 300, demandSeriesLen: 3 },
      final: {}, decision: {},
    },
  },

  /* ===================================================================== GD-20 ===== */
  {
    id: 'GD-20', title: 'فترة تحليل تنتهي بشهر جزئي — القسمة على أيام فعلية لا أشهر كاملة', itemCode: 'GD20',
    proves: 'Golden Dataset #20: القسمة على أيام فعلية لا أشهر كاملة عند انتهاء الفترة بشهر جزئي (buildSalesReport/periodEquivalentMonths — لاين 1541-1578؛ محرك منفصل عن RECO، يُختبر عبر getSalesReport لا RECO.computeForItem).',
    mode: 'salesReport',
    // built dynamically in golden-dataset.spec.js (needs `to` anchored to "today" at run time,
    // matching the exact windowing rule; see buildScenario20() there) — see `dynamic` flag.
    dynamic: true,
  },
];

module.exports = { NOW, fmt, daysFromNow, daysAgo, monthsAgo, L, H, supplierRow, invRow, piRow, poRow, saleRow, returnRow, mapRow, SCENARIOS };
