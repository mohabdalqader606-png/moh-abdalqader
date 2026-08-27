-- ============================================================
-- إعداد قاعدة بيانات شاشة إقرار ضريبة المبيعات
-- مركز الكيلاني للأغذية — مشروع KFC على Supabase
-- ============================================================
-- طريقة التنفيذ:
--   من لوحة Supabase: SQL Editor ← New query ← الصق هذا الملف كاملاً ← Run
--   السكربت آمن لإعادة التنفيذ أكثر من مرة.
-- ============================================================

-- ------------------------------------------------------------
-- 1) الملفات الشخصية والأدوار
--    admin  = مدير: كل الصلاحيات + حذف
--    editor = مدخل بيانات: إنشاء وتعديل
--    viewer = مطالع: قراءة فقط
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text unique,
  full_name  text,
  role       text not null default 'editor' check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now()
);

-- إنشاء ملف شخصي تلقائياً عند إضافة أي مستخدم جديد،
-- وترقية صاحب الحساب الرئيسي إلى مدير مباشرة
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    case when new.email = 'mohabdalqader606@gmail.com' then 'admin' else 'editor' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- دالة تُرجع دور المستخدم الحالي (تُستخدم داخل سياسات الحماية)
create or replace function public.app_role()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'none');
$$;

-- ------------------------------------------------------------
-- 2) جدول الإقرارات
--    إقرار واحد لكل (سنة + فترة)، والتفاصيل الكاملة في حقل data
-- ------------------------------------------------------------
create table if not exists public.sales_tax_declarations (
  id          uuid primary key default gen_random_uuid(),
  year        int  not null check (year between 2020 and 2100),
  period_no   int  not null check (period_no between 1 and 6),
  status      text not null default 'draft' check (status in ('draft','final')),
  data        jsonb not null default '{}'::jsonb,
  output_tax  numeric(14,3) not null default 0,
  input_tax   numeric(14,3) not null default 0,
  net_tax     numeric(14,3) not null default 0,
  notes       text,
  created_by  uuid references auth.users(id),
  updated_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (year, period_no)
);

-- ------------------------------------------------------------
-- 3) جدول تفاصيل الفواتير (اختياري، مرتبط بالإقرار)
-- ------------------------------------------------------------
create table if not exists public.sales_tax_invoices (
  id             uuid primary key default gen_random_uuid(),
  declaration_id uuid references public.sales_tax_declarations(id) on delete cascade,
  kind           text not null check (kind in ('sale','purchase')),
  inv_date       date,
  inv_no         text,
  party          text,
  amount         numeric(14,3) not null default 0,
  tax            numeric(14,3) not null default 0,
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_sti_declaration on public.sales_tax_invoices (declaration_id);
create index if not exists idx_std_year_period on public.sales_tax_declarations (year, period_no);

-- ------------------------------------------------------------
-- 4) تعبئة حقول التدقيق تلقائياً (من أنشأ / من عدّل / متى)
-- ------------------------------------------------------------
create or replace function public.set_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

create or replace function public.touch_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_decl_created on public.sales_tax_declarations;
create trigger trg_decl_created before insert on public.sales_tax_declarations
  for each row execute function public.set_created_by();

drop trigger if exists trg_decl_touch on public.sales_tax_declarations;
create trigger trg_decl_touch before update on public.sales_tax_declarations
  for each row execute function public.touch_updated();

drop trigger if exists trg_inv_created on public.sales_tax_invoices;
create trigger trg_inv_created before insert on public.sales_tax_invoices
  for each row execute function public.set_created_by();

-- ------------------------------------------------------------
-- 5) الحماية (Row Level Security)
--    لا يصل أي صف لأي شخص غير مسجّل دخول، والصلاحيات حسب الدور
-- ------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.sales_tax_declarations  enable row level security;
alter table public.sales_tax_invoices     enable row level security;

-- profiles: الجميع (المسجّلون) يقرؤون الأسماء، والمدير فقط يعدّل الأدوار
drop policy if exists profiles_select        on public.profiles;
drop policy if exists profiles_admin_update  on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- الإقرارات
drop policy if exists decl_select on public.sales_tax_declarations;
drop policy if exists decl_insert on public.sales_tax_declarations;
drop policy if exists decl_update on public.sales_tax_declarations;
drop policy if exists decl_delete on public.sales_tax_declarations;
create policy decl_select on public.sales_tax_declarations
  for select to authenticated using (true);
create policy decl_insert on public.sales_tax_declarations
  for insert to authenticated
  with check (public.app_role() in ('admin','editor'));
create policy decl_update on public.sales_tax_declarations
  for update to authenticated
  using (public.app_role() in ('admin','editor'))
  with check (public.app_role() in ('admin','editor'));
create policy decl_delete on public.sales_tax_declarations
  for delete to authenticated
  using (public.app_role() = 'admin');

-- الفواتير
drop policy if exists inv_select on public.sales_tax_invoices;
drop policy if exists inv_insert on public.sales_tax_invoices;
drop policy if exists inv_update on public.sales_tax_invoices;
drop policy if exists inv_delete on public.sales_tax_invoices;
create policy inv_select on public.sales_tax_invoices
  for select to authenticated using (true);
create policy inv_insert on public.sales_tax_invoices
  for insert to authenticated
  with check (public.app_role() in ('admin','editor'));
create policy inv_update on public.sales_tax_invoices
  for update to authenticated
  using (public.app_role() in ('admin','editor'))
  with check (public.app_role() in ('admin','editor'));
create policy inv_delete on public.sales_tax_invoices
  for delete to authenticated
  using (public.app_role() in ('admin','editor'));

-- ============================================================
-- انتهى. بعد التنفيذ:
--   1) أضف المستخدمين من: Authentication ← Users ← Add user ← Create new user
--      (بريد + كلمة سر لكل موظف — تُنشأ مفعّلة مباشرة)
--   2) صاحب البريد mohabdalqader606@gmail.com يصبح مديراً تلقائياً،
--      ولتغيير دور أي مستخدم آخر: Table Editor ← profiles ← عمود role
--      (القيم المسموحة: admin / editor / viewer)
-- ============================================================
