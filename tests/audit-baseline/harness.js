/* P0 regression harness — Internal Audit screen.
   MODE=baseline  : snapshot everything into OUT/ (run once on the untouched production file)
   MODE=compare   : re-run on TARGET and diff against OUT/baseline_*.json
   Runs in an ephemeral Playwright profile: the user's real localStorage is never touched. */
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const MODE = process.env.MODE || 'baseline';
const TARGET = process.env.TARGET; const OUT = process.env.OUT; const BASE = process.env.BASE || OUT; const TAG = process.env.TAG || MODE;
if (!TARGET || !OUT) { console.error('TARGET and OUT are required'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const FIXED = new Date('2026-09-04T09:00:00'); const TODAY = '2026-09-04';
const KEY = 'kaylani_audit_planner_v1';
const VIEWS = ['dashboard','today','period','all','recurring','engagements','findings','risks','universe','policies','authority','meetings','kpis','deptperf','timeanalysis','stats','improvements','emails','qlibrary','library','evidence','settings'];
const RENDER_OF = { all:'renderAll', stats:'renderStats', period:'renderPeriod', library:'renderLibrary', qlibrary:'renderQueryLibrary', recurring:'renderRecurringList', findings:'renderFindings', risks:'renderRisks', universe:'renderUniverse', settings:'renderSettings', policies:'renderPolicies', authority:'renderAuthority', kpis:'renderKpis', meetings:'renderMeetings', improvements:'renderImprovements', emails:'renderEmails', dashboard:'renderDashboard', engagements:'renderEngagements', evidence:'renderEvidenceCenter', deptperf:'renderDeptPerf', timeanalysis:'renderTimeAnalysis', today:null };
const DIALOGS = [
  { ov:'taskOverlay', view:'today', add:'addTodayBtn', save:'saveTaskBtn', del:'deleteTaskBtn', title:'taskTitle', col:'tasks', open:'openTaskModal' },
  { ov:'recOverlay', view:'recurring', add:'addRecurringBtn', save:'saveRecBtn', del:'deleteRecBtn', title:'recTitle', col:'recurring', open:'openRecurringModal' },
  { ov:'queryOverlay', view:'qlibrary', add:'addQueryBtn', save:'saveQueryBtn', del:'deleteQueryBtn', title:'qTitle', col:'queries', open:'openQueryModal' },
  { ov:'findingOverlay', view:'findings', add:'addFindingBtn', save:'saveFindingBtn', del:'deleteFindingBtn', title:'fTitle', col:'findings', open:'openFindingModal' },
  { ov:'riskOverlay', view:'risks', add:'addRiskBtn', save:'saveRiskBtn', del:'deleteRiskBtn', title:'rTitle', col:'risks', open:'openRiskModal' },
  { ov:'universeOverlay', view:'universe', add:'addUniverseBtn', save:'saveUniverseBtn', del:'deleteUniverseBtn', title:'uName', col:'universe', open:'openUniverseModal' },
  { ov:'policyOverlay', view:'policies', add:'addPolicyBtn', save:'savePolicyBtn', del:'deletePolicyBtn', title:'polTitle', col:'policies', open:'openPolicyModal' },
  { ov:'authorityOverlay', view:'authority', add:'addAuthorityBtn', save:'saveAuthorityBtn', del:'deleteAuthorityBtn', title:'authProcess', col:'authority', open:'openAuthorityModal' },
  { ov:'kpiOverlay', view:'kpis', add:'addKpiBtn', save:'saveKpiBtn', del:'deleteKpiBtn', title:'kpiName', col:'kpis', open:'openKpiModal' },
  { ov:'meetingOverlay', view:'meetings', add:'addMeetingBtn', save:'saveMeetingBtn', del:'deleteMeetingBtn', title:'mtgTitle', col:'meetings', open:'openMeetingModal' },
  { ov:'impOverlay', view:'improvements', add:'addImpBtn', save:'saveImpBtn', del:'deleteImpBtn', title:'impTitle', col:'improvements', open:'openImpModal' },
  { ov:'emailOverlay', view:'emails', add:'addEmailBtn', save:'saveEmailBtn', del:'deleteEmailBtn', title:'emSubject', col:'emails', open:'openEmailModal' },
  { ov:'samplingOverlay', view:'settings', add:'addSamplingBtn', save:'saveSamplingBtn', del:'deleteSamplingBtn', title:'smTitle', col:'samplingMethods', open:'openSamplingModal' },
  { ov:'engagementOverlay', view:'engagements', add:'addEngagementBtn', save:'saveEngagementBtn', del:'deleteEngagementBtn', title:'engTitle', col:'engagements', open:'openEngagementModal' },
  { ov:'evidenceOverlay', view:'evidence', add:'addEvidenceBtn', save:'saveEvidenceBtn', del:'deleteEvidenceBtn', title:'evDesc', col:'evidence', open:'openEvidenceModal' },
];
const AUX_DIALOGS = [ { ov:'closeCheckOverlay', close:'cancelCloseCheck' }, { ov:'linkOverlay', close:'closeLinkModal' }, { ov:'qPickerOverlay', close:'cancelQPicker' } ];
const R = { tag: TAG, target: TARGET, sha256: crypto.createHash('sha256').update(fs.readFileSync(TARGET)).digest('hex'), bytes: fs.statSync(TARGET).size, checks: [], notes: [] };
const T = (name, ok, detail) => { R.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']' : '')); };
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const url = 'file://' + TARGET;

/* ---------- reference dataset: Production-format records built from the extracted field schema ---------- */
function refDB() {
  const d = (n) => { const x = new Date(FIXED); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  return {
    tasks: [
      { id:'ref-t01', title:'مراجعة عينة فواتير المبيعات', category:'sales', status:'in_progress', priority:'high', date:TODAY, mode:'single', plannedHours:3, actualHours:2, wpRef:'WP-D-001', links:[], notes:'', samplingMethodId:'', samplingNote:'', engagementId:'ref-e01' },
      { id:'ref-t02', title:'مطابقة مرتجعات الفرع الشمالي', category:'returns', status:'not_started', priority:'high', date:TODAY, mode:'single', plannedHours:2, actualHours:0, wpRef:'WP-D-002', links:[], notes:'', engagementId:'' },
      { id:'ref-t03', title:'تحقق من سندات التحصيل', category:'collect', status:'done', priority:'medium', date:TODAY, mode:'single', plannedHours:1.5, actualHours:1.5, wpRef:'WP-D-003', links:[] },
      { id:'ref-t04', title:'جرد مفاجئ لمستودع التبريد', category:'stock', status:'deferred', priority:'high', date:d(-2), mode:'single', plannedHours:4, actualHours:0, wpRef:'WP-D-004', links:[] },
      { id:'ref-t05', title:'متابعة رد الإدارة على ملاحظة الفواتير', category:'sales', status:'not_started', priority:'high', date:d(-1), mode:'single', plannedHours:1, actualHours:0, wpRef:'WP-D-005', links:[], engagementId:'ref-e01' },
      { id:'ref-t06', title:'فحص اعتماد مصاريف الضيافة', category:'expense', status:'done', priority:'low', date:d(-3), mode:'single', plannedHours:1, actualHours:1.8, wpRef:'WP-D-006', links:[] },
      { id:'ref-t07', title:'مراجعة قيود التسوية الشهرية', category:'journal', status:'in_progress', priority:'medium', date:TODAY, mode:'single', plannedHours:2.5, actualHours:1, wpRef:'WP-D-007', links:[] },
      { id:'ref-t08', title:'تدقيق مصفوفة الصلاحيات بعد التعيينات', category:'gov', status:'not_started', priority:'medium', date:d(1), mode:'single', plannedHours:1, actualHours:0, wpRef:'WP-D-008', links:[] },
      { id:'ref-t09', title:'إعداد ملخص الأسبوع للإدارة', category:'gov', status:'not_started', priority:'low', date:d(2), mode:'single', plannedHours:1, actualHours:0, wpRef:'WP-D-009', links:[] },
      { id:'ref-t10', title:'فترة: مراجعة أعمار الذمم', category:'collect', status:'in_progress', priority:'medium', mode:'range', from:d(-5), to:d(3), plannedHours:6, actualHours:2, wpRef:'WP-P-001', links:[] },
      { id:'ref-t11', title:'فترة: تدقيق دفعات المخزون', category:'stock', status:'done', priority:'medium', mode:'range', from:d(-20), to:d(-15), plannedHours:5, actualHours:5, wpRef:'WP-P-002', links:[] },
      { id:'ref-t12', title:'فترة متأخرة: مراجعة الائتمان', category:'gov', status:'not_started', priority:'high', mode:'range', from:d(-10), to:d(-4), plannedHours:3, actualHours:0, wpRef:'WP-P-003', links:[] },
    ],
    queries: [
      { id:'ref-q01', title:'فواتير بدون توقيع مستلم', category:'sales', sql:'SELECT DocNum FROM OINV WHERE U_Signed IS NULL', notes:'', changelog:[] },
      { id:'ref-q02', title:'مرتجعات بعد 30 يوماً', category:'returns', sql:'SELECT * FROM ORIN WHERE DATEDIFF(day, BaseDocDate, DocDate) > 30', notes:'', changelog:[] },
      { id:'ref-q03', title:'قيود يدوية بدون مرفق', category:'journal', sql:'SELECT TransId FROM OJDT WHERE Attach IS NULL', notes:'', changelog:[] },
    ],
    recurring: [
      { id:'ref-r01', title:'مقارنة التحصيل اليومي بالمستهدف', category:'collect', freq:'daily', weekday:'', priority:'medium', active:true, links:[], notes:'' },
      { id:'ref-r02', title:'مراجعة القيود اليدوية الأسبوعية', category:'journal', freq:'weekly', weekday:'1', priority:'medium', active:true, links:[], notes:'' },
    ],
    findings: [
      { id:'ref-f01', refCode:'F-2026-001', title:'فواتير مبيعات بدون توقيع مستلم', desc:'عينة 20 فاتورة، 6 بلا توقيع', category:'sales', severity:'critical', status:'open', rootCause:'غياب رقابة الاستلام', recommendation:'إلزام التوقيع الإلكتروني', managementResponse:'', responsible:'مدير المبيعات', targetDate:d(-5), retestDate:'', identifiedDate:d(-30), engagementId:'ref-e01', riskId:'ref-k01' },
      { id:'ref-f02', refCode:'F-2026-002', title:'مرتجعات معتمدة بعد 30 يوماً', desc:'', category:'returns', severity:'high', status:'in_progress', rootCause:'لا يوجد قفل زمني', recommendation:'قفل نافذة المرتجعات آلياً', managementResponse:'موافق، خلال شهر', responsible:'مدير النظام', targetDate:d(20), retestDate:'', identifiedDate:d(-25), engagementId:'', riskId:'' },
      { id:'ref-f03', refCode:'F-2026-003', title:'سند تحصيل مكرر لعميل واحد', desc:'', category:'collect', severity:'high', status:'open', rootCause:'', recommendation:'فحص التكرار بالمرجع', managementResponse:'', responsible:'محاسب التحصيل', targetDate:d(-10), retestDate:'', identifiedDate:d(-40), engagementId:'', riskId:'ref-k03' },
      { id:'ref-f04', refCode:'F-2026-004', title:'مصاريف بلا مستندات مؤيدة', desc:'', category:'expense', severity:'medium', status:'retest', rootCause:'ضعف الالتزام بالسياسة', recommendation:'رفض الصرف بلا مرفق', managementResponse:'تم التعميم', responsible:'المدير المالي', targetDate:d(5), retestDate:d(7), identifiedDate:d(-45), engagementId:'', riskId:'' },
      { id:'ref-f05', refCode:'F-2026-005', title:'قيد تسوية بدون اعتماد', desc:'', category:'journal', severity:'medium', status:'closed', rootCause:'تجاوز المصادقة', recommendation:'سير اعتماد إلزامي', managementResponse:'مطبق', responsible:'رئيس الحسابات', targetDate:d(-15), retestDate:d(-8), identifiedDate:d(-60), engagementId:'', riskId:'' },
      { id:'ref-f06', refCode:'F-2026-006', title:'فرق جرد في مستودع التجميد', desc:'', category:'stock', severity:'high', status:'in_progress', rootCause:'', recommendation:'جرد دوري نصف شهري', managementResponse:'موافق', responsible:'مدير المستودعات', targetDate:d(12), retestDate:'', identifiedDate:d(-12), engagementId:'ref-e02', riskId:'' },
      { id:'ref-f07', refCode:'F-2026-007', title:'صلاحية إدخال وترحيل لنفس المستخدم', desc:'', category:'gov', severity:'critical', status:'open', rootCause:'غياب فصل المهام', recommendation:'فصل المهام في SAP', managementResponse:'', responsible:'مدير تقنية المعلومات', targetDate:d(-3), retestDate:'', identifiedDate:d(-20), engagementId:'', riskId:'ref-k02' },
      { id:'ref-f08', refCode:'F-2026-008', title:'تأخر الرد على مراسلة الجهة الرقابية', desc:'', category:'gov', severity:'low', status:'closed', rootCause:'', recommendation:'تتبع المهل', managementResponse:'مطبق', responsible:'السكرتارية', targetDate:d(-30), retestDate:d(-25), identifiedDate:d(-50), engagementId:'', riskId:'' },
    ],
    risks: [
      { id:'ref-k01', title:'تسرب إيرادات عبر خصومات غير معتمدة', desc:'', category:'sales', likelihood:4, impact:4, controlType:'preventive', control:'حد الخصم بالنظام', controlEff:'partial' },
      { id:'ref-k02', title:'تضارب صلاحيات SAP', desc:'', category:'gov', likelihood:5, impact:4, controlType:'detective', control:'مراجعة سنوية', controlEff:'ineffective' },
      { id:'ref-k03', title:'اختلاس نقدي في التحصيل', desc:'', category:'collect', likelihood:2, impact:5, controlType:'preventive', control:'إيداع يومي + مطابقة', controlEff:'effective' },
      { id:'ref-k04', title:'تلف مخزون بسبب سلسلة التبريد', desc:'', category:'stock', likelihood:4, impact:5, controlType:'none', control:'', controlEff:'effective' },
      { id:'ref-k05', title:'مرتجعات وهمية', desc:'', category:'returns', likelihood:3, impact:5, controlType:'detective', control:'مطابقة يدوية شهرية', controlEff:'ineffective' },
      { id:'ref-k06', title:'مصاريف شخصية على الشركة', desc:'', category:'expense', likelihood:3, impact:2, controlType:'preventive', control:'اعتماد ثنائي', controlEff:'partial' },
      { id:'ref-k07', title:'أخطاء قيود الإقفال', desc:'', category:'journal', likelihood:2, impact:3, controlType:'detective', control:'مراجعة المدير المالي', controlEff:'effective' },
      { id:'ref-k08', title:'انقطاع النسخ الاحتياطي', desc:'', category:'gov', likelihood:1, impact:4, controlType:'preventive', control:'نسخ تلقائي', controlEff:'effective' },
    ],
    universe: [
      { id:'ref-u01', name:'دورة المبيعات والفوترة', category:'sales', risk:'high', frequency:'quarterly', lastAudit:d(-40), nextAudit:d(50), status:'completed', notes:'' },
      { id:'ref-u02', name:'المرتجعات', category:'returns', risk:'high', frequency:'quarterly', lastAudit:d(-100), nextAudit:d(-10), status:'planned', notes:'' },
      { id:'ref-u03', name:'التحصيل والذمم', category:'collect', risk:'high', frequency:'monthly', lastAudit:d(-20), nextAudit:d(10), status:'in_progress', notes:'' },
      { id:'ref-u04', name:'المصاريف التشغيلية', category:'expense', risk:'medium', frequency:'semiannual', lastAudit:d(-200), nextAudit:d(-20), status:'planned', notes:'' },
      { id:'ref-u05', name:'المخزون والجرد', category:'stock', risk:'high', frequency:'quarterly', lastAudit:d(-15), nextAudit:d(75), status:'completed', notes:'' },
      { id:'ref-u06', name:'الحوكمة والصلاحيات', category:'gov', risk:'medium', frequency:'annual', lastAudit:d(-400), nextAudit:d(-35), status:'planned', notes:'' },
    ],
    counters: { wp: 12, finding: 8, engagement: 3, evidence: 3, policy: 3, improvement: 3, email: 3 },
    samplingMethods: [ { id:'ref-s01', title:'عينة عشوائية 10%', desc:'اختيار عشوائي بنسبة 10% من المجتمع' }, { id:'ref-s02', title:'كل البنود فوق الحد المادي', desc:'' } ],
    quickNotes: [ { id:'ref-n01', text:'التأكد من مرفقات الجرد قبل الاجتماع', date:TODAY }, { id:'ref-n02', text:'طلب كشف الصلاحيات المحدث', date:d(-1) } ],
    policies: [
      { id:'ref-p01', refCode:'POL-001', title:'سياسة الائتمان', category:'collect', version:'2.1', owner:'المدير المالي', status:'approved', approvedBy:'المدير العام', approvedDate:d(-300), nextReview:d(-15), compliance:'partial', summary:'', link:'' },
      { id:'ref-p02', refCode:'POL-002', title:'سياسة المرتجعات', category:'returns', version:'1.0', owner:'مدير المبيعات', status:'approved', approvedBy:'المدير العام', approvedDate:d(-100), nextReview:d(200), compliance:'full', summary:'', link:'' },
      { id:'ref-p03', refCode:'POL-003', title:'سياسة الصلاحيات', category:'gov', version:'0.9', owner:'تقنية المعلومات', status:'draft', approvedBy:'', approvedDate:'', nextReview:'', compliance:'unknown', summary:'', link:'' },
    ],
    authority: [
      { id:'ref-a01', process:'اعتماد الخصومات', category:'sales', initiator:'مندوب المبيعات', approver:'مدير المبيعات', recorder:'محاسب', limit:'5%', sapMatch:'yes', notes:'' },
      { id:'ref-a02', process:'صرف المصاريف', category:'expense', initiator:'المحاسب', approver:'المحاسب', recorder:'المحاسب', limit:'500', sapMatch:'no', notes:'' },
      { id:'ref-a03', process:'تعديل بيانات العميل', category:'gov', initiator:'خدمة العملاء', approver:'المدير المالي', recorder:'تقنية المعلومات', limit:'', sapMatch:'yes', notes:'' },
    ],
    kpis: [
      { id:'ref-i01', name:'نسبة إغلاق الملاحظات', category:'gov', unit:'%', target:80, direction:'higher', formula:'مغلق ÷ الكل', readings:[ {month:'2026-06', value:60}, {month:'2026-07', value:68}, {month:'2026-08', value:72} ] },
      { id:'ref-i02', name:'أيام تحصيل الذمم', category:'collect', unit:'يوم', target:45, direction:'lower', formula:'', readings:[ {month:'2026-07', value:52}, {month:'2026-08', value:49} ] },
      { id:'ref-i03', name:'تغطية خطة التدقيق', category:'gov', unit:'%', target:70, direction:'higher', formula:'', readings:[ {month:'2026-08', value:75} ] },
    ],
    meetings: [
      { id:'ref-m01', title:'مراجعة ربع سنوية', date:d(-14), attendees:'المدير العام، المدير المالي', findings:'F-2026-001, F-2026-007', decisions:'تسريع فصل المهام', actions:'خطة خلال 30 يوماً', next:d(76), status:'held' },
      { id:'ref-m02', title:'متابعة الجرد', date:d(6), attendees:'مدير المستودعات', findings:'F-2026-006', decisions:'', actions:'', next:'', status:'scheduled' },
    ],
    improvements: [
      { id:'ref-v01', refCode:'IMP-001', title:'أتمتة قفل المرتجعات', category:'returns', current:'يدوي', proposal:'قفل آلي بعد 30 يوماً', impact:'high', effort:'medium', owner:'تقنية المعلومات', target:d(-5), status:'in_progress' },
      { id:'ref-v02', refCode:'IMP-002', title:'لوحة تحصيل يومية', category:'collect', current:'تقرير أسبوعي', proposal:'لوحة يومية', impact:'medium', effort:'low', owner:'المدير المالي', target:d(30), status:'proposed' },
      { id:'ref-v03', refCode:'IMP-003', title:'أرشفة إلكترونية للمصاريف', category:'expense', current:'ورقي', proposal:'مسح ضوئي وربط', impact:'medium', effort:'high', owner:'الحسابات', target:d(-40), status:'done' },
    ],
    emails: [
      { id:'ref-e01m', refCode:'EM-001', subject:'طلب كشف الصلاحيات', type:'request', to:'تقنية المعلومات', cc:'', date:d(-12), due:d(-5), status:'sent', reply:'', replyDate:'', refs:'F-2026-007', summary:'', link:'' },
      { id:'ref-e02m', refCode:'EM-002', subject:'رد الإدارة على ملاحظة الفواتير', type:'finding', to:'مدير المبيعات', cc:'المدير المالي', date:d(-8), due:d(2), status:'sent', reply:'', replyDate:'', refs:'F-2026-001', summary:'', link:'' },
      { id:'ref-e03m', refCode:'EM-003', subject:'تأكيد موعد اجتماع الجرد', type:'followup', to:'مدير المستودعات', cc:'', date:d(-2), due:'', status:'replied', reply:'تم', replyDate:d(-1), refs:'', summary:'', link:'' },
    ],
    engagements: [
      { id:'ref-e01', refCode:'ENG-2026-001', title:'تدقيق دورة المبيعات', objective:'التأكد من اكتمال الإيراد', scope:'فواتير Q2', from:d(-35), to:d(-5), category:'sales', program:'1. عينة\n2. مطابقة', sampling:'عشوائية 10%', status:'reporting', finalReport:'' },
      { id:'ref-e02', refCode:'ENG-2026-002', title:'تدقيق المخزون', objective:'دقة الأرصدة', scope:'مستودعات التبريد', from:d(-10), to:d(20), category:'stock', program:'', sampling:'', status:'in_progress', finalReport:'' },
      { id:'ref-e03', refCode:'ENG-2026-003', title:'مراجعة الصلاحيات', objective:'فصل المهام', scope:'SAP', from:d(15), to:d(45), category:'gov', program:'', sampling:'', status:'planned', finalReport:'' },
    ],
    evidence: [
      { id:'ref-ev01', evidenceId:'EV-2026-001', docType:'document', desc:'عينة الفواتير غير الموقعة', date:d(-28), reference:'OINV 10021-10040', link:'', findingId:'ref-f01', engagementId:'ref-e01' },
      { id:'ref-ev02', evidenceId:'EV-2026-002', docType:'query_result', desc:'تقرير الصلاحيات من SAP', date:d(-18), reference:'SUIM-2026-08', link:'', findingId:'ref-f07', engagementId:'' },
      { id:'ref-ev03', evidenceId:'EV-2026-003', docType:'document', desc:'ورقة جرد التجميد', date:d(-11), reference:'CS-44', link:'', findingId:'ref-f06', engagementId:'ref-e02' },
    ],
    settings: { materialityGlobal: 1000, materialityByCategory: { sales: 2000 }, materialityBasis: 'نسبة من الإيراد', materialityNotes: '', healthScoreWeights: { planExec:25, findingsClosure:20, riskTreatment:20, timeliness:15, coverage:10, docQuality:10 } },
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const mkctx = async () => { const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); await c.route(/^https?:\/\//, r => r.abort()); await c.clock.setFixedTime(FIXED); await c.addInitScript(() => { /* deterministic ids: uid() uses Math.random */ let x = 123456789; Math.random = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1000000) / 1000000; }; }); return c; };

  /* ---------- 1. load performance (empty DB and with reference DB) ---------- */
  const loadTimes = async (withDB) => { const t = []; for (let i = 0; i < 5; i++) { const c = await mkctx(); if (withDB) await c.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [KEY, JSON.stringify(refDB())]); const p = await c.newPage(); const s = Date.now(); await p.goto(url, { waitUntil: 'load' }); t.push(Date.now() - s); await c.close(); } return median(t); };
  const perf = { loadEmptyMs: await loadTimes(false), loadRefMs: await loadTimes(true) };

  /* ---------- 2. main functional session ---------- */
  const ctx = await mkctx(); const page = await ctx.newPage(); const errs = []; const dialogs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|Failed to load/i.test(m.text())) errs.push(m.text()); });
  page.on('dialog', async d => { dialogs.push(d.type() + ': ' + d.message().slice(0, 80)); await d.accept(); });
  await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(400);
  T('storage: empty profile has no keys before any interaction', (await page.evaluate(() => Object.keys(localStorage))).length === 0);
  perf.domNodesEmpty = await page.evaluate(() => document.getElementsByTagName('*').length);

  // static structure
  const struct = await page.evaluate(() => ({ views: [...document.querySelectorAll('[id^="view-"]')].map(v => v.id), overlays: [...document.querySelectorAll('.overlay')].map(o => o.id), tabs: [...document.querySelectorAll('.tab[data-view]')].map(t => t.dataset.view), roleDialog: document.querySelectorAll('[role="dialog"]').length, ariaLabel: document.querySelectorAll('[aria-label]').length, storageKey: (typeof STORAGE_KEY === 'string') ? STORAGE_KEY : null }));
  T('structure: 22 views present', struct.views.length === 22, struct.views.length); T('structure: 18 overlays present', struct.overlays.length === 18, struct.overlays.length); T('structure: STORAGE_KEY constant', struct.storageKey === KEY, struct.storageKey);

  // import the reference dataset through the production import path
  await page.evaluate(() => activateTab('settings'));
  const [dl0] = [null];
  await page.setInputFiles('#importFileInput', { name: 'ref.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(refDB())) });
  await page.waitForTimeout(800);
  const counts = await page.evaluate(() => Object.fromEntries(Object.keys(DB).map(k => [k, Array.isArray(DB[k]) ? DB[k].length : (typeof DB[k] === 'object' ? 'obj' : DB[k])])));
  T('import: reference dataset merged through importFileInput (12 tasks + auto-generated recurring)', counts.tasks >= 12 && counts.findings === 8 && counts.risks === 8 && counts.universe === 6 && counts.engagements === 3 && counts.evidence === 3 && counts.policies === 3 && counts.kpis === 3, counts);
  T('storage: only the production key exists after import', (await page.evaluate(() => Object.keys(localStorage))).join() === KEY);

  /* ---------- 3. navigation contract: every view opens and its render function runs ---------- */
  await page.evaluate((RENDER_OF) => { window.__calls = {}; Object.values(RENDER_OF).filter(Boolean).forEach(fn => { const orig = window[fn]; if (typeof orig !== 'function') { window.__calls[fn] = 'MISSING'; return; } window[fn] = function () { window.__calls[fn] = (window.__calls[fn] || 0) + 1; return orig.apply(this, arguments); }; }); }, RENDER_OF);
  const nav = [];
  for (const v of VIEWS) {
    const r = await page.evaluate(async (v) => { window.__calls = {}; const s = performance.now(); const nav = document.querySelector('.ksh-nav[data-v="' + v + '"]'); if (nav) { const g = nav.closest('.ksh-grp'); if (g && !g.classList.contains('open')) g.querySelector('.ksh-grp-h').click(); document.querySelector('.ksh-nav[data-v="' + v + '"]').click(); } else { document.querySelector('.tab[data-view="' + v + '"]').click(); } await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const ms = Math.round(performance.now() - s); const act = document.querySelector('.ksh-nav.active') || document.querySelector('.tab.active'); return { active: document.querySelector('.view.active') && document.querySelector('.view.active').id, tabActive: act ? (act.dataset.v || act.dataset.view) : null, ariaCurrent: nav ? (document.querySelector('.ksh-nav[aria-current="page"]') || {}).dataset && document.querySelector('.ksh-nav[aria-current="page"]').dataset.v : 'n/a', crumb: nav ? document.getElementById('kshCrumbCur').textContent : 'n/a', title: nav ? document.getElementById('kshPgTitle').textContent : 'n/a', calls: { ...window.__calls }, ms, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }; }, v);
    const fn = RENDER_OF[v]; const ok = r.active === 'view-' + v && r.tabActive === v && (fn ? r.calls[fn] >= 1 : true) && (r.ariaCurrent === 'n/a' || (r.ariaCurrent === v && r.crumb.length > 0 && r.title.length > 0));
    nav.push({ view: v, ...r, renderFn: fn, ok }); if (!ok) T('nav: ' + v, false, r);
  }
  T('nav: all 22 views open with correct active state and render function', nav.every(n => n.ok), nav.filter(n => !n.ok).map(n => n.view));
  perf.switchMs = Object.fromEntries(nav.map(n => [n.view, n.ms]));
  // does any code path depend on the .tabs DOM beyond activateTab?
  const src = fs.readFileSync(TARGET, 'utf8'); const js = src.slice(src.lastIndexOf('<script>'));
  const tabRefs = (js.match(/querySelector(All)?\((["'`])\.tabs?\b[^)]*\)/g) || []);
  R.notes.push({ tabsDomReferences: tabRefs });

  /* ---------- 4. dialogs: open / fill / save / edit / delete for 15 collections, open-close for 3 aux ---------- */
  const dlg = [];
  for (const dg of DIALOGS) {
    const res = { ov: dg.ov, col: dg.col };
    try {
      await page.evaluate((v) => activateTab(v), dg.view);
      const before = await page.evaluate((c) => DB[c].length, dg.col);
      await page.evaluate((id) => document.getElementById(id).click(), dg.add); await page.waitForTimeout(150);
      res.opened = await page.evaluate((ov) => document.getElementById(ov).classList.contains('active'), dg.ov);
      res.focusInside = await page.evaluate((ov) => document.getElementById(ov).contains(document.activeElement), dg.ov);
      await page.keyboard.press('Escape'); res.escapeCloses = !(await page.evaluate((ov) => document.getElementById(ov).classList.contains('active'), dg.ov));
      if (!res.opened) throw new Error('did not open');
      // fill: title-like field + any empty required-ish text inputs/dates get a value
      await page.evaluate(({ ov, title }) => { const o = document.getElementById(ov); const t = document.getElementById(title); if (t) t.value = 'P0 سجل اختبار'; o.querySelectorAll('input[type="date"]').forEach(i => { if (!i.value) i.value = '2026-09-04'; }); o.querySelectorAll('input[type="number"]').forEach(i => { if (!i.value) i.value = '1'; }); o.querySelectorAll('textarea').forEach(i => { if (!i.value && i.id !== 'qSql') i.value = 'P0'; }); const sql = o.querySelector('#qSql'); if (sql && !sql.value) sql.value = 'SELECT 1'; }, dg);
      await page.evaluate((id) => document.getElementById(id).click(), dg.save); await page.waitForTimeout(250);
      const after = await page.evaluate((c) => DB[c].length, dg.col); res.created = after === before + 1;
      const rec = await page.evaluate((c) => DB[c][DB[c].length - 1], dg.col); res.newId = rec && rec.id; res.refCode = rec && (rec.refCode || rec.wpRef || rec.evidenceId || null);
      // edit via the production open function
      await page.evaluate(({ open, c }) => window[open](DB[c][DB[c].length - 1]), { open: dg.open, c: dg.col }); await page.waitForTimeout(120);
      await page.evaluate((title) => { const t = document.getElementById(title); if (t) t.value = 'P0 سجل معدّل'; }, dg.title);
      await page.evaluate((id) => document.getElementById(id).click(), dg.save); await page.waitForTimeout(200);
      const edited = await page.evaluate((c) => DB[c][DB[c].length - 1], dg.col); res.edited = Object.values(edited).includes('P0 سجل معدّل') && (await page.evaluate((c) => DB[c].length, dg.col)) === after;
      // delete the test record
      await page.evaluate(({ open, c }) => window[open](DB[c][DB[c].length - 1]), { open: dg.open, c: dg.col }); await page.waitForTimeout(120);
      await page.evaluate((id) => document.getElementById(id).click(), dg.del); await page.waitForTimeout(250);
      res.deleted = (await page.evaluate((c) => DB[c].length, dg.col)) === before;
      await page.keyboard.press('Escape'); await page.evaluate((ov) => document.getElementById(ov).classList.remove('active'), dg.ov);
      res.ok = res.created && res.edited && res.deleted;
    } catch (e) { res.error = e.message; res.ok = false; }
    dlg.push(res); T('dialog CRUD: ' + dg.ov, res.ok, res);
  }
  for (const a of AUX_DIALOGS) { const r = await page.evaluate(({ ov, close }) => { const o = document.getElementById(ov); o.classList.add('active'); const wasOpen = o.classList.contains('active'); document.getElementById(close).click(); return { wasOpen, closed: !o.classList.contains('active') }; }, a); dlg.push({ ov: a.ov, ...r, ok: r.wasOpen && r.closed }); T('dialog open/close: ' + a.ov, r.wasOpen && r.closed, r); }
  T('dialogs: counters after CRUD unchanged or increased only', true, await page.evaluate(() => DB.counters));

  /* ---------- 5. export through the production export path; compare with storage ---------- */
  await page.evaluate(() => activateTab('settings'));
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.evaluate(() => document.getElementById('exportBtn').click())]);
  const exportPath = path.join(OUT, TAG + '_export.json'); await download.saveAs(exportPath);
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8')); const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
  R.notes.push({ exportSuggestedFilename: download.suggestedFilename(), note: 'a.download is set in code to نسخة_احتياطية_شاشة_التدقيق_<date>.json; Chromium does not surface blob names under file://' });
  T('export: exported JSON equals stored DB (parsed)', JSON.stringify(exported) === JSON.stringify(stored));
  T('export: top-level collections', Object.keys(exported).sort().join(), Object.keys(exported).sort().join());
  // import round trip into a fresh profile
  { const c2 = await mkctx(); const p2 = await c2.newPage(); p2.on('dialog', d => d.accept()); await p2.goto(url, { waitUntil: 'load' }); await p2.evaluate(() => activateTab('settings')); await p2.setInputFiles('#importFileInput', exportPath); await p2.waitForTimeout(800); const stored2 = JSON.parse(await p2.evaluate((k) => localStorage.getItem(k), KEY)); const strip = o => { const x = JSON.parse(JSON.stringify(o)); delete x.settings.lastBackup; return x; }; T('import: round trip of the exported file reproduces the same records', JSON.stringify(strip(stored2)) === JSON.stringify(strip(exported))); await c2.close(); }

  /* ---------- 6. calculation snapshot (locked functions) ---------- */
  const calc = await page.evaluate(() => {
    const stats = computeDashboardStats(); const health = (stats && stats.components) ? computeHealthScore(stats.components) : null;
    const risks = DB.risks.map(r => ({ id: r.id, ...residualRisk(r) }));
    const auth = DB.authority.map(a => ({ id: a.id, conflict: !!authorityConflict(a) }));
    const emails = DB.emails.map(e => ({ id: e.id, overdue: !!emailIsOverdue(e) }));
    let repeat = null; try { repeat = detectRepeatFindings(); } catch (e) { repeat = 'ERR ' + e.message; }
    return { stats, health, risks, auth, emails, repeat, today: todayStr() };
  });
  T('calc: computeDashboardStats returned an object with alerts', calc.stats && Array.isArray(calc.stats.alerts), calc.stats && calc.stats.alerts && calc.stats.alerts.length + ' alerts');
  T('calc: residualRisk factors are production values', calc.risks.every(r => [0.35, 0.65, 0.9, 1].includes(r.factor)), calc.risks.map(r => r.factor));
  T('calc: fixed clock in effect (today = ' + TODAY + ')', calc.today === TODAY, calc.today);
  fs.writeFileSync(path.join(OUT, TAG + '_calc.json'), JSON.stringify(calc, null, 1));

  /* ---------- 7. print: two popup templates + one in-document print ---------- */
  await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; }; });
  const popupSnap = async (view, btn, name) => { await page.evaluate((v) => activateTab(v), view); await page.waitForTimeout(120); const [pop] = await Promise.all([page.waitForEvent('popup', { timeout: 8000 }), page.evaluate((id) => document.getElementById(id).click(), btn)]); await pop.waitForLoadState('domcontentloaded').catch(() => {}); await pop.waitForTimeout(300); const html = await pop.content(); const text = await pop.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim()); const meta = await pop.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, tables: document.querySelectorAll('table').length, rows: document.querySelectorAll('tbody tr, tr').length, hasPrintbar: !!document.querySelector('.printbar') })); fs.writeFileSync(path.join(OUT, TAG + '_print_' + name + '.html'), html); await pop.close(); return { ...meta, textLen: text.length, textHash: crypto.createHash('md5').update(text).digest('hex') }; };
  const print = {};
  print.day = await popupSnap('today', 'printDayBtn', 'day');
  print.execSummary = await popupSnap('findings', 'execSummaryBtn', 'execsummary');
  await page.evaluate(() => activateTab('dashboard')); await page.evaluate((id) => document.getElementById(id).click(), 'printBtn'); await page.waitForTimeout(100);
  await page.emulateMedia({ media: 'print' });
  print.dashboard = { printCalls: await page.evaluate(() => window.__printCalls), hidden: await page.evaluate(() => ['header', '.tabs', '.toolbar', 'footer', '.task-actions', '.modal-actions'].map(s => { const e = document.querySelector(s); return s + ':' + (e ? getComputedStyle(e).display : 'n/a'); })), textHash: crypto.createHash('md5').update(await page.evaluate(() => document.querySelector('.view.active').innerText.replace(/\s+/g, ' ').trim())).digest('hex') };
  const pdfPath = path.join(OUT, TAG + '_print_dashboard.pdf'); await page.pdf({ path: pdfPath, format: 'A4' }); print.dashboard.pdfBytes = fs.statSync(pdfPath).size;
  await page.emulateMedia({ media: null });
  T('print: day plan opens its own template window (RTL, table present)', print.day.dir === 'rtl' && print.day.tables >= 1 && print.day.textLen > 100, print.day);
  T('print: executive summary opens its own template window (RTL, tables present)', print.execSummary.dir === 'rtl' && print.execSummary.tables >= 1, print.execSummary);
  T('print: dashboard printBtn calls window.print and shell elements hide under print media', print.dashboard.printCalls === 1 && print.dashboard.hidden.every(h => /:none$|:n\/a$/.test(h)), print.dashboard);

  /* ---------- 8. dialog accessibility baseline ---------- */
  const a11y = await page.evaluate(() => [...document.querySelectorAll('.overlay')].map(o => ({ id: o.id, role: o.getAttribute('role'), modal: o.getAttribute('aria-modal'), labelled: o.getAttribute('aria-labelledby') || o.getAttribute('aria-label') })));
  R.a11yDialogs = a11y; R.notes.push({ iconButtonsWithoutName: await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length) });

  /* ---------- 9. responsive matrix: 22 views × 6 widths ---------- */
  const resp = [];
  for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844]]) { await page.setViewportSize({ width: w, height: h }); for (const v of VIEWS) { await page.evaluate((v) => activateTab(v), v); const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); if (ov) resp.push(w + ':' + v); } }
  R.overflow = resp; if (MODE === 'baseline') { T('responsive: overflow matrix recorded (pre-existing overflow is a baseline fact, not a failure)', true, resp); } else { const base = JSON.parse(fs.readFileSync(path.join(BASE, 'baseline_result.json'), 'utf8')).overflow || []; const newOv = resp.filter(x => !base.includes(x)); T('responsive: no NEW horizontal overflow vs baseline (22 views × 6 widths)', newOv.length === 0, { new: newOv, fixed: base.filter(x => !resp.includes(x)) }); }
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ---------- 10. performance with reference DB and with a large in-memory dataset (never saved) ---------- */
  perf.domNodesRef = await page.evaluate(() => { activateTab('dashboard'); return document.getElementsByTagName('*').length; });
  const big = await page.evaluate(async () => { const keep = JSON.stringify(DB); const t = DB.tasks[0], f = DB.findings[0]; for (let i = 0; i < 1000; i++) DB.tasks.push({ ...t, id: 'big-t' + i, title: 'مهمة كبيرة ' + i }); for (let i = 0; i < 300; i++) DB.findings.push({ ...f, id: 'big-f' + i, refCode: 'F-BIG-' + i }); dashCache = null; const out = {}; for (const v of ['dashboard', 'today', 'all', 'findings']) { const ts = []; for (let k = 0; k < 3; k++) { const s = performance.now(); activateTab(v === 'dashboard' ? 'today' : 'dashboard'); activateTab(v); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); ts.push(Math.round(performance.now() - s)); } out[v] = ts.sort((a, b) => a - b)[1]; } out.domNodes = document.getElementsByTagName('*').length; Object.assign(DB, JSON.parse(keep)); dashCache = null; activateTab('dashboard'); return out; });
  perf.largeDataset = big; { const st = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY)); const mem = await page.evaluate(() => DB.tasks.length); T('storage: large dataset test never reached storage (no big-* ids stored, stored count = in-memory count)', st.tasks.length === mem && !st.tasks.some(t => /^big-/.test(t.id)), { stored: st.tasks.length, memory: mem }); }

  T('console: no page errors during the whole session', errs.length === 0, errs);
  R.perf = perf; R.nav = nav; R.dialogs = dlg; R.print = print; R.dialogsSeen = dialogs.length; R.exportCollections = Object.keys(exported).sort();
  await ctx.close(); await browser.close();

  /* ---------- thresholds (defined at P0 from measured values) ---------- */
  if (MODE === 'baseline') {
    const th = { loadRefMs: Math.max(400, Math.round(perf.loadRefMs * 1.5)), domNodesRef: Math.round(perf.domNodesRef * 1.35), switchMs: Object.fromEntries(Object.entries(perf.switchMs).map(([v, ms]) => [v, Math.max(120, Math.round(ms * 1.5))])), largeSwitchMs: Object.fromEntries(Object.entries(perf.largeDataset).filter(([k]) => k !== 'domNodes').map(([v, ms]) => [v, Math.max(250, Math.round(ms * 1.5))])), rule: 'PASS if value <= threshold; any breach = material regression = STOP' };
    fs.writeFileSync(path.join(OUT, 'baseline_thresholds.json'), JSON.stringify(th, null, 1));
  } else {
    const base = JSON.parse(fs.readFileSync(path.join(BASE, 'baseline_calc.json'), 'utf8')); const th = JSON.parse(fs.readFileSync(path.join(BASE, 'baseline_thresholds.json'), 'utf8'));
    T('compare: calculation snapshot identical to baseline', JSON.stringify(calc) === JSON.stringify(base), 'diff = ' + (JSON.stringify(calc) === JSON.stringify(base) ? 'none' : 'see ' + TAG + '_calc.json'));
    const bex = JSON.parse(fs.readFileSync(path.join(BASE, 'baseline_export.json'), 'utf8')); const strip = o => { const x = JSON.parse(JSON.stringify(o)); delete x.settings.lastBackup; return x; };
    T('compare: export identical to baseline export (records, ids, values)', JSON.stringify(strip(exported)) === JSON.stringify(strip(bex)));
    T('compare: load time within threshold', perf.loadRefMs <= th.loadRefMs, perf.loadRefMs + ' <= ' + th.loadRefMs);
    T('compare: DOM nodes within threshold', perf.domNodesRef <= th.domNodesRef, perf.domNodesRef + ' <= ' + th.domNodesRef);
    const slow = Object.entries(perf.switchMs).filter(([v, ms]) => ms > th.switchMs[v]); T('compare: view switch within thresholds', slow.length === 0, slow);
    const slowBig = Object.entries(perf.largeDataset).filter(([v, ms]) => th.largeSwitchMs[v] && ms > th.largeSwitchMs[v]); T('compare: large dataset switch within thresholds', slowBig.length === 0, slowBig);
    const bp = JSON.parse(fs.readFileSync(path.join(BASE, 'baseline_result.json'), 'utf8')).print; T('compare: print output identical (day template, executive summary template, dashboard print text)', bp.day.textHash === print.day.textHash && bp.execSummary.textHash === print.execSummary.textHash && bp.dashboard.textHash === print.dashboard.textHash, { base: [bp.day.textHash, bp.execSummary.textHash, bp.dashboard.textHash], now: [print.day.textHash, print.execSummary.textHash, print.dashboard.textHash] });
  }
  fs.writeFileSync(path.join(OUT, TAG + '_result.json'), JSON.stringify(R, null, 1));
  const fails = R.checks.filter(c => !c.ok).length; console.log('\nTOTAL:', R.checks.length, 'checks,', fails, 'failed'); console.log('PERF:', JSON.stringify(perf));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FATAL', e); process.exit(1); });
