-- ============================================================
-- إضافة v4: نسخ متعددة للإقرار الواحد (نسخة لكل موظف عن نفس الفترة)
-- الهدف: عدة موظفين يعدّون إقرار الفترة نفسها كلٌّ على نسخته،
--        والمدير يقارن النتائج ويعتمد نسخة واحدة رسمية.
-- يُنفَّذ مرة واحدة من SQL Editor ← Run (آمن لإعادة التنفيذ)
-- ============================================================

-- 1) عمود صاحب النسخة
alter table public.sales_tax_declarations
  add column if not exists owner_id uuid references auth.users(id);

-- تعبئة النسخ القديمة: صاحبها من أنشأها (أو من عدّلها، أو المدير)
update public.sales_tax_declarations
   set owner_id = coalesce(created_by, updated_by,
        (select id from public.profiles where role='admin' order by created_at limit 1))
 where owner_id is null;

alter table public.sales_tax_declarations alter column owner_id set not null;

-- 2) القيد الفريد يصبح (سنة + فترة + صاحب النسخة) بدل (سنة + فترة)
alter table public.sales_tax_declarations
  drop constraint if exists sales_tax_declarations_year_period_no_key;
create unique index if not exists uq_decl_year_period_owner
  on public.sales_tax_declarations (year, period_no, owner_id);

-- 3) عند الإنشاء: صاحب النسخة تلقائياً هو المستخدم الحالي
create or replace function public.set_decl_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  if new.owner_id is null then new.owner_id := auth.uid(); end if;
  return new;
end;
$$;
drop trigger if exists trg_decl_created on public.sales_tax_declarations;
create trigger trg_decl_created before insert on public.sales_tax_declarations
  for each row execute function public.set_decl_created();

-- 4) اعتماد النسخة النهائية صلاحية المدير فقط
create or replace function public.guard_decl_final()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'final'
     and (tg_op = 'INSERT' or old.status is distinct from 'final')
     and public.app_role() <> 'admin' then
    raise exception 'اعتماد الإقرار النهائي صلاحية المدير فقط';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_decl_final_guard on public.sales_tax_declarations;
create trigger trg_decl_final_guard before insert or update on public.sales_tax_declarations
  for each row execute function public.guard_decl_final();

-- 5) الحماية: كل موظف يعدّل نسخته فقط، والمدير يعدّل الجميع
drop policy if exists decl_insert on public.sales_tax_declarations;
create policy decl_insert on public.sales_tax_declarations
  for insert to authenticated
  with check (
    public.app_role() = 'admin'
    or (public.app_role() = 'editor' and owner_id = auth.uid())
  );

drop policy if exists decl_update on public.sales_tax_declarations;
create policy decl_update on public.sales_tax_declarations
  for update to authenticated
  using (
    public.app_role() = 'admin'
    or (public.app_role() = 'editor' and owner_id = auth.uid())
  )
  with check (
    public.app_role() = 'admin'
    or (public.app_role() = 'editor' and owner_id = auth.uid())
  );

-- الحذف يبقى للمدير فقط (سياسة decl_delete من السكربت الأول كما هي)

-- ============================================================
-- انتهى. بعد التنفيذ:
--   * كل موظف يسجّل دخوله ويختار الفترة فتُفتح «نسخته» الخاصة (فارغة أول مرة)
--   * المدير يرى كل النسخ في تبويب الفترة، يقارن، ويضغط «اعتماد» على الأفضل
-- ============================================================
