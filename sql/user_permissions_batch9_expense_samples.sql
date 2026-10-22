-- ============================================================================
-- USER & PERMISSIONS — BATCH 9: تسجيل شاشة "عينات المصروفات" + جداولها + RLS + Realtime
-- ============================================================================
-- هذا الملف SQL جاهز للتشغيل اليدوي على Supabase SQL Editor فقط (آمن لإعادة التنفيذ).
-- لم يُشغَّل من قبل Claude — لا يوجد اتصال مباشر بقاعدة البيانات بهذه الجلسة.
-- شاشة جديدة كلياً: شاشة_عينات_المصروفات.html (screen_id = 'expense-samples').
-- جداول جديدة بالكامل، لا تعديل على أي جدول موجود مسبقاً:
--   expense_sample_statements : كشف مصروفات (اسم الكشف، صف لكل كشف)
--   expense_sample_rows       : سطور الكشف (بيانات السطر بـ data jsonb) + حالة العينة:
--                               sel (مختار كعينة) · done (تم التصوير) · note (ملاحظة) · sel_at · done_at
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) تسجيل الشاشة بجدول screens — تظهر كعمود جديد بمصفوفة الصلاحيات
-- ----------------------------------------------------------------------------
insert into public.screens (id, name, file, status, screen_type) values
  ('expense-samples', 'عينات المصروفات', 'شاشة_عينات_المصروفات.html', 'active', 'business')
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 2) الجداول
-- ----------------------------------------------------------------------------
create table if not exists public.expense_sample_statements(
  id          text primary key,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);
create unique index if not exists idx_exp_sample_statements_name on public.expense_sample_statements(name);

create table if not exists public.expense_sample_rows(
  id            text primary key,
  statement_id  text not null references public.expense_sample_statements(id) on delete cascade,
  k             text not null,                       -- مفتاح مطابقة السطر عند إعادة الاستيراد
  data          jsonb not null default '{}'::jsonb,  -- تاريخ/حركة/مستند/حساب/مصروف/مبالغ/بيان/مراجع
  sel           boolean not null default false,      -- مختار كعينة
  done          boolean not null default false,      -- تم التصوير
  note          text not null default '',
  sel_at        timestamptz,
  done_at       timestamptz,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);
create index if not exists idx_exp_sample_rows_statement on public.expense_sample_rows(statement_id);
create index if not exists idx_exp_sample_rows_sel on public.expense_sample_rows(statement_id, sel, done);

-- تعبئة updated_by تلقائياً
create or replace function public.set_exp_sample_updated_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_exp_sample_rows_upd on public.expense_sample_rows;
create trigger trg_exp_sample_rows_upd before insert or update on public.expense_sample_rows
  for each row execute function public.set_exp_sample_updated_by();
drop trigger if exists trg_exp_sample_st_upd on public.expense_sample_statements;
create trigger trg_exp_sample_st_upd before insert or update on public.expense_sample_statements
  for each row execute function public.set_exp_sample_updated_by();


-- ----------------------------------------------------------------------------
-- 3) RLS — قراءة: أي صلاحية فعلية (VIEW/INPUT/ADMIN) على 'expense-samples' أو مدير صلاحيات.
--    كتابة: INPUT أو ADMIN فقط، أو مدير صلاحيات.
-- ----------------------------------------------------------------------------
alter table public.expense_sample_statements enable row level security;
alter table public.expense_sample_rows       enable row level security;

drop policy if exists exs_st_select   on public.expense_sample_statements;
drop policy if exists exs_st_write    on public.expense_sample_statements;
drop policy if exists exs_rows_select on public.expense_sample_rows;
drop policy if exists exs_rows_write  on public.expense_sample_rows;

create policy exs_st_select on public.expense_sample_statements
  for select using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples')
  );
create policy exs_rows_select on public.expense_sample_rows
  for select using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples')
  );

create policy exs_st_write on public.expense_sample_statements
  for all using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples' and u.permission in ('INPUT','ADMIN'))
  ) with check (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples' and u.permission in ('INPUT','ADMIN'))
  );
create policy exs_rows_write on public.expense_sample_rows
  for all using (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples' and u.permission in ('INPUT','ADMIN'))
  ) with check (
    public.is_permissions_admin()
    or exists (select 1 from public.user_screen_permissions u
               where u.user_id = auth.uid() and u.screen_id = 'expense-samples' and u.permission in ('INPUT','ADMIN'))
  );


-- ----------------------------------------------------------------------------
-- 4) التحديث اللحظي بين الأجهزة (Realtime) — الموبايل والكمبيوتر يتزامنان فوراً
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'expense_sample_rows') then
    alter publication supabase_realtime add table public.expense_sample_rows;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'expense_sample_statements') then
    alter publication supabase_realtime add table public.expense_sample_statements;
  end if;
end $$;
alter table public.expense_sample_rows replica identity full;
alter table public.expense_sample_statements replica identity full;


-- ----------------------------------------------------------------------------
-- 5) الصلاحيات: حساب المالك mohabdalqader606@gmail.com هو الوحيد بصلاحية ADMIN على هذه الشاشة.
--    أي صف صلاحية آخر على 'expense-samples' يُحذف (بطلب المالك: هذا الحساب فقط أدمن).
--    لاحقاً يمكن منح VIEW/INPUT لموظفين من شاشة إدارة المستخدمين والصلاحيات.
-- ----------------------------------------------------------------------------
delete from public.user_screen_permissions
where screen_id = 'expense-samples'
  and user_id not in (select id from auth.users where email = 'mohabdalqader606@gmail.com');

insert into public.user_screen_permissions (user_id, screen_id, permission)
select id, 'expense-samples', 'ADMIN'
from auth.users
where email = 'mohabdalqader606@gmail.com'
on conflict (user_id, screen_id) do update set permission = excluded.permission;


-- ============================================================================
-- بعد التشغيل:
-- ============================================================================
--   1) افتح شاشة_عينات_المصروفات.html وسجّل الدخول بنفس حساب باقي الشاشات.
--   2) تبويب «البيانات»: الصق الكويري أو ارفع Excel — يُرفع للسحابة ويظهر على الموبايل فوراً.
--   3) لو كان عندك بيانات محفوظة محلياً من الإصدار v1.0 تظهر لافتة «رفع إلى السحابة» بنفس التبويب.
--   4) لموظف آخر: من شاشة إدارة المستخدمين والصلاحيات أعطه على عمود «عينات المصروفات»:
--      VIEW = متابعة فقط · INPUT/ADMIN = اختيار عينات وتعليم التصوير والملاحظات.
--   5) إضافة الشاشة لصفحة البوابة (index.html على main) خطوة منفصلة بطلبك.
--   6) للتحقق:
--
-- select (select count(*) from public.expense_sample_statements) as statements,
--        (select count(*) from public.expense_sample_rows)       as rows_total,
--        (select count(*) from public.expense_sample_rows where sel)  as samples,
--        (select count(*) from public.expense_sample_rows where done) as photographed;
