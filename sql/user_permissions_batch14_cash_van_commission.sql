-- ============================================================================
-- USER & PERMISSIONS — BATCH 14: تسجيل "عمولة الكاش فان" + جدولها + إنفاذ فعلي
-- ============================================================================
-- هذا الملف SQL جاهز للتشغيل اليدوي على Supabase SQL Editor فقط.
-- لم يُشغَّل من قبل Claude — لا يوجد اتصال مباشر بقاعدة البيانات بهذه الجلسة.
-- شاشة جديدة كلياً (لا مستخدمين فعليين عليها اليوم على هذه القاعدة) — بدون أي
-- اعتماد على allowed_apps القديمة، الدخول محكوم بالكامل عبر Matrix
-- (user_screen_permissions)، تماماً مثل damage-reports (batch 4).
--
-- تصميم مبسَّط عن قصد: بدل تفكيك البيانات (مندوبين/مبيعات/تحصيل/فترات) لجداول
-- منفصلة، تُخزَّن كل بيانات الشاشة كصف واحد JSONB (نفس شكل الحالة المحلية التي
-- كانت الشاشة تحفظها بـlocalStorage سابقاً) — هذا يحافظ 100% على منطق الحساب
-- المُختبر مسبقاً بالشاشة (العمولات، المكافآت، تصنيف الشيكات...) بدون إعادة
-- كتابته، مع نفس إنفاذ RLS الحقيقي المبني على user_screen_permissions. يمكن
-- تفكيكها لجداول علائقية بملف لاحق لو احتاج العمل صلاحيات أدق من مستوى الشاشة
-- كاملة (مثلاً فرز الوصول حسب فرع/قسم).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) تسجيل الشاشة بجدول screens (Batch 1) — تظهر كعمود جديد بمصفوفة الصلاحيات
-- ----------------------------------------------------------------------------
insert into public.screens (id, name, file, status, screen_type) values
  ('cashvan-commission', 'عمولة الكاش فان', 'عمولة_الكاش_فان.html', 'active', 'business')
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 2) جدول البيانات (جديد بالكامل) — صف واحد (id=1) يحمل كل حالة الشاشة:
--    المندوبون، المبيعات الشهرية، التحصيل والشيكات، إعدادات المعادلة، وبيانات
--    كل فترة (مدير/مشرف/نسبة عمولة المشرف/المساعدين/تعديلات كل مندوب).
-- ----------------------------------------------------------------------------
create table if not exists public.cvcomm_state(
  id         smallint primary key default 1 check (id = 1),  -- صف واحد فقط (Singleton)
  data       jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.cvcomm_state (id, data) values (1, '{}'::jsonb)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 3) RLS — إنفاذ فعلي عبر مصفوفة الصلاحيات (screen_id='cashvan-commission')، لا
--    سياسة عامة "أي مستخدم مسجّل دخول".
-- ----------------------------------------------------------------------------
alter table public.cvcomm_state enable row level security;

drop policy if exists "authenticated read/write cvcomm_state" on public.cvcomm_state;

-- قراءة: أي مستوى صلاحية فعلي (VIEW/INPUT/ADMIN) على شاشة عمولة الكاش فان، أو مدير صلاحيات
create policy cvcomm_state_select on public.cvcomm_state
  for select using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cashvan-commission')
  );

-- كتابة (تحديث فقط — الصف الوحيد مُدرَج أعلاه): فقط INPUT أو ADMIN على شاشة عمولة
-- الكاش فان، أو مدير صلاحيات
create policy cvcomm_state_write on public.cvcomm_state
  for update using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cashvan-commission'
                 and u.permission in ('INPUT','ADMIN'))
  ) with check (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cashvan-commission'
                 and u.permission in ('INPUT','ADMIN'))
  );

-- ملاحظة: لا داعي لسياسة insert/delete — الصف الوحيد (id=1) أُدرج مرة واحدة بهذا
-- الملف نفسه (كمالك الاتصال بـSupabase SQL Editor، خارج RLS)، والشاشة لا تنشئ
-- أو تحذف صفوفاً، فقط تحدّث data بالصف الموجود.


-- ============================================================================
-- ⚠️ خطوة إلزامية قبل فتح الشاشة لأي موظف:
-- ============================================================================
-- بما إنها شاشة جديدة كلياً، افتح شاشة "إدارة المستخدمين والصلاحيات" وعيّن صلاحية
-- صريحة (VIEW/INPUT/ADMIN) على عمود "عمولة الكاش فان" لكل موظف يفترض يستخدمها —
-- بدون صف = NONE = ممنوع الدخول كلياً (لا استثناء "allowed_apps" هنا، هذه الشاشة
-- الوحيد الذي يحكمها هو user_screen_permissions). زر "🗑 حذف كافة البيانات" داخل
-- الشاشة نفسها مقصور إضافياً على صلاحية ADMIN فقط (فوق شرط RLS).
--
-- ترحيل البيانات التاريخية (أي نسخة JSON كانت محفوظة محلياً بمتصفح أي موظف من
-- قبل هذا الربط، عبر localStorage) خطوة منفصلة لم تُنفَّذ بعد — ليست جزءاً من
-- هذا الملف. يمكن استيرادها لاحقاً من داخل الشاشة نفسها (زر "⬆ استيراد نسخة")
-- بعد تسجيل الدخول بصلاحية INPUT/ADMIN، وهذا سيحدّث صف cvcomm_state المشترك.
-- ============================================================================
