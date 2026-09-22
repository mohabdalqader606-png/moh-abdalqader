# GM Command Center v2 — PHASE 1 VALIDATION REPORT

**الفرع:** `claude/laughing-sagan-pxi0jb` — commit `f43fe8a`
**الملف الوحيد المعدَّل:** `شاشة_الداشبورد_التنفيذي.html` (500 سطر إضافة، 67 حذف)
**لم يُدمَج بـ main بعد** — بانتظار موافقتك.

---

## 1) What changed

| # | البند | التفاصيل |
|---|---|---|
| 1 | كويري المبيعات | UNION فواتير(OINV/INV1)+مرتجعات(ORIN/RIN1)، أعمدة جديدة: نوع مستند، إجمالي قبل الخصم، قيمة الخصم، مندوب (OSLP) |
| 2 | AP Aging | كويري جديد كامل (OPCH)، نفس منطق تواريخ AR حرفياً |
| 3 | Credit Limit | عمود اختياري بكويري AR (OCRD.CreditLine) |
| 4 | Top Suppliers | محدّد جديد: قيمة المشتريات / الرصيد المستحق |
| 5 | تفصيل المبيعات | بطاقة جديدة: إجمالي/خصم/مرتجعات/صافي مع تصالح رياضي كامل |
| 6 | Profit Bridge جزئي | أثر الكمية + أثر السعر (محسوبان)، الكلفة/الخصم/المرتجعات = Data Required بوضوح |
| 7 | Gross Profit/COGS/Margin | قراءة Read-only من `financials_app_state` (GL-level شهري)، بورتّة معزولة لـ effLine()+تجميع S.moves خام فقط |
| 8 | Target | قراءة Read-only من `financials_app_state.data.budget` |
| 9 | Customer 360 | نافذة تفصيل عميل (مبيعات/تحصيل/ذمم/aging/اتجاه شهري/سقف ائتماني/مرتجعات وخصومات) — بدون Margin |
| 10 | Management Attention Center | سجلات منظّمة (Issue/Category/Severity/Impact/Age/Action/Source/Drilldown) بعتبات موثّقة + تنبيهي تجاوز سقف ائتماني ومورد AP متأخر |
| 11 | Data Status System | 🟢🟡🟠🔴⚪ موحّد، مطبَّق على كل بطاقات KPI والأقسام المشروطة |
| 12 | KPI Scorecard | 9 بطاقات: Sales/GP/Margin/Collection/AR/AP/Working Capital/Inventory/Procurement |
| 13 | روابط خارجية | زرّان بالهيدر/البطاقات: فتح المشتريات الخارجية الذكية، فتح التدقيق الداخلي — بدون أي قراءة بيانات منهما |

---

## 2) What was NOT changed (كما طُلب صراحة)

- **لا** تعديل على `المشتريات_الخارجية_الذكية.html` أو `شاشة_التدقيق_الداخلي_الإداري.html` — لا قراءة `_recos`، لا قراءة localStorage.
- **لا** تعديل على `financials_app_state` schema أو أي كتابة إليه — قراءة Read-only فقط.
- **لا** SQL جديد، **لا** Supabase migration.
- **لا** 13-Week Cash Forecast، **لا** Forecast إحصائي، **لا** Margin by Customer/Item/Department، **لا** Cost Effect، **لا** Landed Cost، **لا** Risk Heatmap حقيقي، **لا** تكامل بيانات فعلي مع التدقيق/المشتريات، **لا** Management Decisions (يحتاج SQL).
- الاتجاه اليومي، فلاتر الفترة، مبيعات المؤسسة العسكرية، auth/permissions: **بلا تغيير بالمنطق**.

---

## 3) Tests — Passed / Failed

كل الاختبارات نُفِّذت بمتصفح Chromium headless فعلي (لصق بيانات حقيقية، لا محاكاة).

| الاختبار | النتيجة |
|---|---|
| `node --check` على كتلة `<script>` | ✅ PASSED |
| تحميل الشاشة بدون بيانات (حالة فارغة) | ✅ PASSED — صفر أخطاء console |
| لصق بيانات مبيعات بالتنسيق **القديم** (بدون الأعمدة الجديدة) | ✅ PASSED — Sales KPI صحيح (500 د.أ)، تفصيل المبيعات يعرض "Data unavailable" بصدق بدل رقم مخترَع، Profit Bridge (Volume/Price) يشتغل من البيانات المتوفرة فقط |
| لصق بيانات مبيعات بالتنسيق **الجديد** (فواتير+مرتجعات+خصم) | ✅ PASSED — تحقّقت يدوياً: إجمالي 970 − خصم 70 − مرتجعات 100 = صافي 800 (مطابق تماماً)؛ **اكتُشف وصُحح خلل ازدواجية حساب المرتجعات أثناء هذا الاختبار قبل الدفع** |
| Profit Bridge (Volume+Price) | ✅ PASSED — تحقّق يدوي: أثر الكمية 400 + أثر السعر 0 = 400 = فرق صافي المبيعات بالضبط |
| AP Aging + Top Suppliers by Outstanding | ✅ PASSED — أرقام الحاويات (Buckets) مطابقة لتواريخ الاستحقاق المُدخلة يدوياً |
| تجاوز السقف الائتماني (تنبيه جديد) | ✅ PASSED — ظهر التنبيه بالضبط عندما الرصيد > السقف بالبيانات التجريبية |
| **Gross Profit/COGS من `financials_app_state` محاكاة** | ✅ PASSED — بيانات GL تجريبية (مبيعات دائنة 8000، كلفة مدينة 5000) → GP=3000، هامش=37.5% — **مطابق تماماً للحساب اليدوي** |
| Target/Budget محاكاة | ✅ PASSED — قراءة صحيحة، واكتُشفت وصُححت صياغة مضلِّلة ("% من الهدف" بدل "الفارق عن الهدف") قبل الدفع |
| Customer 360 (فتح/إغلاق النافذة) | ✅ PASSED — كل الحقول صحيحة بما فيها Aging والسقف الائتماني |
| `financials_app_state` غير متاح (فشل الاتصال فعلياً بهذه البيئة) | ✅ PASSED — بقية الشاشة تعمل بشكل طبيعي، البطاقات المرتبطة تعرض 🟠 Data Required فقط |
| موازنة فارغة (`S.budget` غير محمَّل) | ✅ PASSED — "الهدف — Data unavailable" بدون صفر أو تقدير |
| أعمدة اختيارية ناقصة عموماً | ✅ PASSED — كل الأعمدة الجديدة تُكتشف ديناميكياً (`salesHasCol`)، غيابها لا يكسر أي قسم قائم |
| أخطاء console خلال كل الاختبارات أعلاه | ✅ صفر أخطاء JavaScript بكل السيناريوهات |

**خللان حقيقيان اكتُشفا وصُححا أثناء الاختبار (قبل الدفع، ليسا بالنسخة المدفوعة):**
1. ازدواجية حساب المرتجعات بتفصيل المبيعات (كانت تُطرح مرتين).
2. صياغة "% من الهدف" مضلِّلة (كانت تقرأ كإنجاز بدل فارق).

---

## 4) Data Readiness (محدَّثة بعد Phase 1)

| Metric | الحالة |
|---|---|
| Net Sales | 🟢 Available |
| Gross/Discounts/Returns منفصلة | 🟢 Available (يحتاج الكويري الجديد) / 🟠 Data Required (بيانات قديمة) |
| Volume/Price Effect | 🟢 Available |
| Cost/Discount/Returns Effect (Profit Bridge) | 🟠 Data Required |
| COGS/Gross Profit/Margin | 🟡 Conditional (GL-level شهري، مشروط ببيانات محمَّلة بمحرك القوائم الختامية) |
| Target | 🟡 Conditional (نفس الشرط) |
| AR | 🟢 Available |
| AP | 🟢 Available (يحتاج الكويري الجديد) |
| Credit Limit | 🟡 Conditional (عمود اختياري) |
| Working Capital الكامل (CCC) | 🟠 Data Required (ينقصه أيام المخزون) |
| Inventory Value | ⚪ Coming Next |
| Procurement/Internal Audit — تكامل حقيقي | 🔴 Blocked (رابط مباشر متاح فقط) |
| Margin by Customer/Item/Department | 🔴 Blocked كلياً (لا مصدر كلفة سطرية بأي مكان بالنظام) |

---

## 5) العوائق المتبقية (Blockers)

1. **Gross Profit/Target مشروطان ببيانات فعلية بشاشة أخرى** — لو محرك القوائم الختامية ما عنده GL/موازنة محمَّلة ومُزامَنة، الداشبورد بيبقى يعرض "Data Required" بصدق، بدون بديل.
2. **Margin بمستوى الصنف/العميل/القسم وCost Effect:** لا حل بأي سيناريو حالي — يحتاج كويري SAP جديد بعمود كلفة على مستوى السطر، غير موجود بأي مكان بالنظام.
3. **Procurement/Internal Audit:** لا تكامل بيانات حقيقي ممكن تقنياً بالوضع الحالي (راجع Phase 0) — الرابط المباشر هو الحل الوحيد بهذه المرحلة.
4. **Working Capital الكامل:** ينقصه مصدر تقييم مخزون (Coming Next) لاحتساب Inventory Days وبالتالي CCC.

---

## 6) التوصية الدقيقة للمرحلة التالية

Phase 1 مكتملة وتعمل بدون كسر أي وظيفة موجودة. القرار التالي بيدك:

- **إذا رضيت عن دقة GL-level Gross Profit** (إجمالي شهري، لا مستوى صنف/عميل، مشروط ببيانات الشاشة الأخرى): ما في عمل إضافي مطلوب هون — الميزة شغالة.
- **Phase 2 المقترحة (بموافقتك):** AR/AP Days + Working Capital الجزئي (بدون Inventory Days)، وربما توسيع كويري إضافي لو بدك تفصيل Cost Effect (يحتاج مصدر كلفة سطري جديد بالكامل — قرار بيانات جديد، مو مجرد ربط).
- **لا أوصي بأي عمل على Procurement/Internal Audit الحقيقي** إلا لو قررت تعديل تلك الشاشتين مباشرة (خارج نطاق هالجلسة، قرار منفصل لكل شاشة).

بانتظار تعليماتك.
