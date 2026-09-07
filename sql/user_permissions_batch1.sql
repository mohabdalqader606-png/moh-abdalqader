-- ============================================================================
-- USER & PERMISSIONS — BATCH 1: REGISTRY + DATA MODEL  (Design v2)
-- ============================================================================
-- هذا الملف SQL جاهز للتشغيل اليدوي على Supabase SQL Editor فقط.
-- لم يُشغَّل من قبل Claude — لا يوجد اتصال مباشر بقاعدة البيانات بهذه الجلسة.
-- كل الأسطر READ/WRITE على جداول/دوال جديدة بالكامل (screens, user_screen_permissions,
-- is_permissions_admin). لا تعديل على profiles، لا تعديل على أي جدول موجود مسبقاً،
-- لا تعديل على أي شاشة HTML.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) جدول Registry: 7 شاشات تشغيلية (business) + شاشة نظامية واحدة (system)
-- ----------------------------------------------------------------------------
create table if not exists public.screens (
  id          text primary key,
  name        text not null,
  file        text,
  status      text not null default 'active'   check (status in ('active','frozen','inactive')),
  screen_type text not null default 'business' check (screen_type in ('business','system'))
);

insert into public.screens (id, name, file, status, screen_type) values
  ('mil',                      'عميل المؤسسة الاستهلاكية العسكرية', 'شاشة_عميل_المؤسسة_الاستهلاكية_العسكرية.html',                'active', 'business'),
  ('mil-branch-sales',         'مبيعات المؤسسة العسكرية حسب الفرع', 'شاشة_مبيعات_المؤسسة_العسكرية_حسب_الفرع.html',                'active', 'business'),
  ('debt-aging',                'تحليل مخالفات عمر الذمة',           'شاشة_تحليل_مخالفات_عمر_الذمة_v36.html',                       'active', 'business'),
  ('financials',                'القوائم الختامية والتحليل المالي',  'محرك_القوائم_الختامية_والتحليل_المالي_v48.1_FS (جديد).html',  'frozen', 'business'),
  ('procurement-intelligence',  'ذكاء المشتريات والمخزون',           'شاشة_ذكاء_المشتريات_والمخزون.html',                           'active', 'business'),
  ('internal-audit-portal',     'التدقيق الداخلي والحوكمة',          'شاشة_التدقيق_الداخلي_الإداري.html',                           'active', 'business'),
  ('business-lists',            'قوائم الأعمال',                     'قوائم_الأعمال.html',                                          'active', 'business'),
  ('user-permissions',          'إدارة المستخدمين والصلاحيات',       null,                                                           'active', 'system')
on conflict (id) do nothing;

-- ملاحظة: 'user-permissions' شاشة نظامية (system) لإدارة الصلاحيات نفسها — لا تُعرَض كعمود
-- بمصفوفة الصلاحيات الرئيسية (Matrix). الأعمدة التشغيلية بالـMatrix = 7 شاشات business فقط
-- (استعلام الواجهة لاحقاً: where screen_type='business'). file = NULL لأنها بلا ملف HTML بعد.


-- ----------------------------------------------------------------------------
-- 2) جدول المصفوفة: User × Screen → Permission
--    NONE = غياب الصف (لا تُخزَّن قيمة NONE إطلاقاً — القيود أدناه تمنعها)
-- ----------------------------------------------------------------------------
create table if not exists public.user_screen_permissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  screen_id   text not null references public.screens(id) on delete cascade,
  permission  text not null check (permission in ('VIEW','INPUT','ADMIN')),
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now(),
  unique (user_id, screen_id)
);

create index if not exists idx_usp_user   on public.user_screen_permissions(user_id);
create index if not exists idx_usp_screen on public.user_screen_permissions(screen_id);


-- ----------------------------------------------------------------------------
-- 3) is_permissions_admin() — Security Definer، تتجنب Recursive RLS
-- ----------------------------------------------------------------------------
-- تُنفَّذ بصلاحيات مالكها (SECURITY DEFINER)، فتتجاوز RLS على استعلامها الداخلي لـ
-- user_screen_permissions بأمان (لا FORCE ROW LEVEL SECURITY مفعّلة على الجدول) — هذا
-- ما يمنع الدوران (Recursive RLS): لا تُقيَّم أي Policy أثناء تنفيذ الاستعلام الداخلي هنا.
-- تُعيد استخدام app_role() الموجودة فعلاً بالمشروع، بدل تكرار منطق قراءة profiles.role.
create or replace function public.is_permissions_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app_role() = 'admin'                                             -- Legacy Break-Glass (دائم)
    or exists (                                                       -- Explicit Permissions Admin
      select 1 from public.user_screen_permissions u
      where u.user_id = auth.uid()
        and u.screen_id = 'user-permissions'
        and u.permission = 'ADMIN'
    );
$$;


-- ----------------------------------------------------------------------------
-- 4) RLS — الجداول الجديدة فقط، لا تعديل على profiles إطلاقاً
-- ----------------------------------------------------------------------------
alter table public.screens enable row level security;
alter table public.user_screen_permissions enable row level security;

-- screens: بيانات مرجعية غير حساسة (اسم/ملف/حالة/نوع الشاشة) — قراءة مفتوحة لأي مستخدم
-- مسجّل دخول، والكتابة (إضافة/تعديل/حذف شاشة من الكتالوج) لمن يدير نظام الصلاحيات فقط
create policy screens_select_authenticated on public.screens
  for select using (auth.role() = 'authenticated');

create policy screens_admin_write on public.screens
  for all using (public.is_permissions_admin()) with check (public.is_permissions_admin());

-- user_screen_permissions: Legacy admin (app_role()='admin') أو Explicit ADMIN على
-- screen_id='user-permissions' معاً — عبر is_permissions_admin() فقط، بلا أي فحص مباشر
-- (Recursive) داخل الـPolicy نفسها.
create policy usp_admin_select on public.user_screen_permissions
  for select using (public.is_permissions_admin());

create policy usp_admin_insert on public.user_screen_permissions
  for insert with check (public.is_permissions_admin());

create policy usp_admin_update on public.user_screen_permissions
  for update using (public.is_permissions_admin()) with check (public.is_permissions_admin());

create policy usp_admin_delete on public.user_screen_permissions
  for delete using (public.is_permissions_admin());


-- ============================================================================
-- END OF BATCH 1 (Design v2)
-- ============================================================================
