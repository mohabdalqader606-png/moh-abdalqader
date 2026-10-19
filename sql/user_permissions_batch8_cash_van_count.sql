-- ============================================================================
-- USER & PERMISSIONS — BATCH 8: تسجيل شاشة "جرد الكاش فان" + جداولها + إنفاذ فعلي
-- ============================================================================
-- هذا الملف SQL جاهز للتشغيل اليدوي على Supabase SQL Editor فقط.
-- لم يُشغَّل من قبل Claude — لا يوجد اتصال مباشر بقاعدة البيانات بهذه الجلسة.
-- شاشة جديدة كلياً: شاشة_جرد_الكاش_فان.html (screen_id = 'cash-van-count').
-- جداول جديدة بالكامل، لا تعديل على أي جدول موجود مسبقاً:
--   cash_van_counts   : عملية جرد لكل مندوب (صف لكل جرد، الكميات والملاحظات وأساس الاحتساب بـ data jsonb)
--   cash_van_settings : إعدادات مشتركة (أصناف مضافة يدوياً، تعديلات أسعار يدوية) — صف واحد id='global'
--   cash_van_items    : أسعار قائمة "1 Cach Van" + نسبة الضريبة + اسم/مورد/وحدة كل صنف
--                       (تُعبّأ من داخل الشاشة: زر «الأسعار والضريبة» ← رفع ملفّي SAP)
-- الأسعار لا تُكتب بأي ملف بالمستودع (المستودع عام) — موجودة فقط بهذا الجدول خلف RLS.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) تسجيل الشاشة بجدول screens — تظهر كعمود جديد بمصفوفة الصلاحيات
-- ----------------------------------------------------------------------------
insert into public.screens (id, name, file, status, screen_type) values
  ('cash-van-count', 'جرد الكاش فان', 'شاشة_جرد_الكاش_فان.html', 'active', 'business')
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 2) الجداول
-- ----------------------------------------------------------------------------
create table if not exists public.cash_van_counts(
  id text primary key,
  rep text,
  count_date date,
  locked boolean not null default false,
  data jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cash_van_counts_rep_date on public.cash_van_counts(rep, count_date);

create table if not exists public.cash_van_settings(
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_van_items(
  item_code text primary key,
  item_name text,
  vendor text,
  uom text,
  tax_pct numeric not null default 0,
  price numeric,
  updated_at timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 3) RLS — قراءة: أي صلاحية فعلية (VIEW/INPUT/ADMIN) على 'cash-van-count' أو مدير صلاحيات.
--    كتابة: INPUT أو ADMIN فقط، أو مدير صلاحيات.
-- ----------------------------------------------------------------------------
alter table public.cash_van_counts   enable row level security;
alter table public.cash_van_settings enable row level security;
alter table public.cash_van_items    enable row level security;

drop policy if exists cvc_counts_select   on public.cash_van_counts;
drop policy if exists cvc_counts_write    on public.cash_van_counts;
drop policy if exists cvc_settings_select on public.cash_van_settings;
drop policy if exists cvc_settings_write  on public.cash_van_settings;
drop policy if exists cvc_items_select    on public.cash_van_items;
drop policy if exists cvc_items_write     on public.cash_van_items;

create policy cvc_counts_select on public.cash_van_counts
  for select using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cash-van-count')
  );
create policy cvc_settings_select on public.cash_van_settings
  for select using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cash-van-count')
  );
create policy cvc_items_select on public.cash_van_items
  for select using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cash-van-count')
  );

create policy cvc_counts_write on public.cash_van_counts
  for all using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cash-van-count' and u.permission in ('INPUT','ADMIN'))
  ) with check (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cash-van-count' and u.permission in ('INPUT','ADMIN'))
  );
create policy cvc_settings_write on public.cash_van_settings
  for all using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cash-van-count' and u.permission in ('INPUT','ADMIN'))
  ) with check (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cash-van-count' and u.permission in ('INPUT','ADMIN'))
  );
create policy cvc_items_write on public.cash_van_items
  for all using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cash-van-count' and u.permission in ('INPUT','ADMIN'))
  ) with check (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'cash-van-count' and u.permission in ('INPUT','ADMIN'))
  );


-- ----------------------------------------------------------------------------
-- 4) منح صلاحية ADMIN لحساب المالك — عدّل الإيميل هنا لو الحساب الفعلي مختلف قبل التشغيل.
-- ----------------------------------------------------------------------------
insert into public.user_screen_permissions (user_id, screen_id, permission)
select id, 'cash-van-count', 'ADMIN'
from auth.users
where email = 'mohabdalqader606@gmail.com'
on conflict (user_id, screen_id) do update set permission = excluded.permission;


-- ============================================================================
-- بعد التشغيل:
-- ============================================================================
--   1) ادخل البوابة: تظهر بطاقة «جرد الكاش فان» (قسم المخزون).
--   2) افتح الشاشة ← زر «الأسعار والضريبة» ← ارفع ملف قائمة الأسعار (1 Cach Van)
--      وملف بيانات الأصناف (Item Master Data) المصدَّرين من SAP كنص — مرة واحدة،
--      وكل ما تغيّرت الأسعار.
--   3) جرودات النسخة القديمة (المحلية): خذ منها «نسخة احتياطية» ثم «استرجاع» بالشاشة
--      الجديدة — تُرفع للسيرفر تلقائياً.
--   4) لموظف آخر: من شاشة إدارة المستخدمين والصلاحيات أعطه على عمود «جرد الكاش فان»:
--      VIEW = عرض وتقارير فقط · INPUT/ADMIN = إدخال وتعديل.
--   5) للتحقق:
--
-- select (select count(*) from public.cash_van_counts)  as counts,
--        (select count(*) from public.cash_van_items)   as items,
--        (select count(*) from public.cash_van_items where price is not null) as priced;
