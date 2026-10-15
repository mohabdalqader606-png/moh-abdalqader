-- ============================================================================
-- USER & PERMISSIONS — BATCH 6: مزامنة بيانات شاشة "تحليل الحزمة اليومية للتدقيق" لكل مستخدم
-- ============================================================================
-- هذا الملف SQL جاهز للتشغيل اليدوي على Supabase SQL Editor فقط.
-- لم يُشغَّل من قبل Claude — لا يوجد اتصال مباشر بقاعدة البيانات بهذه الجلسة.
-- جدول جديد بالكامل (audit_pack_data) لا يعدّل أي جدول موجود مسبقاً.
--
-- الفكرة: كل مستخدم يرفع كشوف الكويريات وعمر الذمة في الشاشة، وتُحفظ له مضغوطة (gzip + base64)
-- باسم حسابه، فيجدها عند الدخول من أي جهاز. صف واحد لكل (مستخدم × مفتاح):
--   key = q1..q16 (كشوف الكويريات)، aging (كشف الأرصدة والأعمار)، aging_chk (كشف الشيكات)،
--         prefs (الإعدادات: تاريخ اللقطة، الفترات، ربط المديرين والفروع...).
-- الأمان: RLS — كل مستخدم يقرأ ويكتب ويحذف صفوفه فقط (auth.uid() = user_id). لا يرى أحد بيانات غيره
-- ولا حتى مدير الصلاحيات. صلاحية الدخول للشاشة نفسها تبقى عبر مصفوفة الصلاحيات (Batch 5).
-- ============================================================================

create table if not exists public.audit_pack_data (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  key        text        not null,
  src        text,                                   -- اسم الملف/المصدر كما ظهر للمستخدم
  rows       integer,                                -- عدد أسطر الكشف (للعرض فقط)
  loaded_at  timestamptz,                            -- وقت رفع الكشف (يُستخدم لمعرفة الأحدث بين الجهاز والسحابة)
  enc        text        not null default 'gzip-b64' check (enc in ('gzip-b64','json')),
  payload    text        not null,                   -- الكشف نفسه مضغوطاً
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.audit_pack_data enable row level security;

drop policy if exists apd_own_select on public.audit_pack_data;
drop policy if exists apd_own_insert on public.audit_pack_data;
drop policy if exists apd_own_update on public.audit_pack_data;
drop policy if exists apd_own_delete on public.audit_pack_data;

create policy apd_own_select on public.audit_pack_data
  for select using (auth.uid() = user_id);
create policy apd_own_insert on public.audit_pack_data
  for insert with check (auth.uid() = user_id);
create policy apd_own_update on public.audit_pack_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy apd_own_delete on public.audit_pack_data
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- ⚠️ للتحقق بعد التشغيل:
-- ============================================================================
--   1) سجّل دخول على الشاشة من جهازك وارفع أي كشف؛ يظهر بجانب اسمك "✓ متزامن".
--   2) افتح الشاشة من جهاز آخر (أو متصفح آخر) بنفس الحساب: الكشف يظهر تلقائياً.
--   3) الاستعلام التالي يبيّن ما خُزّن لكل مستخدم (الحجم بالكيلوبايت بعد الضغط):
--
-- select p.email, d.key, d.src, d.rows, round(length(d.payload)/1024.0) as kb, d.updated_at
-- from public.audit_pack_data d join auth.users p on p.id = d.user_id
-- order by p.email, d.key;
--
--   4) لو ظهر "⚠ غير متزامن" بجانب اسم المستخدم: مرّر الفأرة عليه لقراءة سبب الخطأ؛ الأغلب أن هذا
--      الملف لم يُشغَّل بعد (الجدول غير موجود) أو انقطع الاتصال. البيانات تبقى محفوظة على الجهاز وتُرفع
--      تلقائياً في الدخول التالي.
-- ============================================================================
