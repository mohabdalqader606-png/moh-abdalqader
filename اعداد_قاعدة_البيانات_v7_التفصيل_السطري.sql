-- ============================================================
-- إضافة v7: التفصيل السطري لتحليل المبيعات (مضغوط gzip)
-- يُحفظ مرة واحدة عند رفع ملف المبيعات (لا مع كل حفظ تلقائي)
-- ويُحمَّل عند الطلب فقط — حجم الصف بعد الضغط ~2% من الأصل.
-- يُنفَّذ مرة واحدة من SQL Editor ← Run (آمن لإعادة التنفيذ)
-- ============================================================

create table if not exists public.decl_sales_rows (
  decl_id    uuid primary key references public.sales_tax_declarations(id) on delete cascade,
  gz         text not null,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_dsr()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_dsr_touch on public.decl_sales_rows;
create trigger trg_dsr_touch before insert or update on public.decl_sales_rows
  for each row execute function public.touch_dsr();

alter table public.decl_sales_rows enable row level security;

drop policy if exists dsr_select on public.decl_sales_rows;
drop policy if exists dsr_insert on public.decl_sales_rows;
drop policy if exists dsr_update on public.decl_sales_rows;
drop policy if exists dsr_delete on public.decl_sales_rows;

-- القراءة: كل المستخدمين الموثقين (مثل الإقرارات نفسها)
create policy dsr_select on public.decl_sales_rows
  for select to authenticated using (true);

-- الكتابة/التعديل/الحذف: الأدمن، أو صاحب نسخة الإقرار نفسها
create policy dsr_insert on public.decl_sales_rows
  for insert to authenticated
  with check (exists (select 1 from public.sales_tax_declarations d
    where d.id = decl_id and (public.app_role() = 'admin' or d.owner_id = auth.uid())));
create policy dsr_update on public.decl_sales_rows
  for update to authenticated
  using (exists (select 1 from public.sales_tax_declarations d
    where d.id = decl_id and (public.app_role() = 'admin' or d.owner_id = auth.uid())))
  with check (exists (select 1 from public.sales_tax_declarations d
    where d.id = decl_id and (public.app_role() = 'admin' or d.owner_id = auth.uid())));
create policy dsr_delete on public.decl_sales_rows
  for delete to authenticated
  using (exists (select 1 from public.sales_tax_declarations d
    where d.id = decl_id and (public.app_role() = 'admin' or d.owner_id = auth.uid())));

-- تنظيف: إزالة الأسطر الثقيلة التي حُفظت داخل حمولة الإقرار بالإصدار 79
update public.sales_tax_declarations
set data = (data - 'rows') - 'dcols'
where data ? 'rows';
