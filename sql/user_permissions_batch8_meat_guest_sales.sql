-- ============================================================================
-- USER & PERMISSIONS — BATCH 8: محترف اللحوم – نظام الرقابة اليومية للمبيعات والذمم
-- (حساب ذمم «مبيعات الضيف»)  —  screen_id = 'meat-guest-sales'
-- ============================================================================
-- هذا الملف SQL للتشغيل اليدوي على Supabase SQL Editor فقط (مشروع KFC).
-- لم يُشغَّل من قبل Claude على قاعدة البيانات الفعلية — اختُبر على نسخة Postgres محلية
-- تحاكي Supabase أُعيد فيها تشغيل ملفات SQL الموجودة بالمستودع قبله.
-- آمن لإعادة التشغيل (if not exists / or replace / drop policy if exists).
--
-- ما يضيفه (كل الكائنات جديدة وتبدأ بـ mp_gs_ — لا يعدّل أي جدول أو سياسة موجودة):
--   1) تسجيل الشاشة في public.screens + صلاحية ADMIN لصاحب الحساب.
--   2) دوال مساعدة: mp_gs_perm() / mp_gs_me()  (SECURITY DEFINER — لا تعتمد على
--      قدرة المستخدم على قراءة صفه في user_screen_permissions).
--   3) الجداول: mp_gs_settings, mp_gs_customers, mp_gs_transactions, mp_gs_approvals,
--      mp_gs_audit_log.
--   4) Triggers: ختم المنفذ والوقت من الخادم، سبب إلزامي للتعديل/الإلغاء/الاستعادة،
--      منع الحذف النهائي للحركات، سجل تدقيق تلقائي بالقيم السابقة والجديدة،
--      إسقاط حالة الاعتماد تلقائياً عند أي تغيير يمس الفترة.
--   5) RLS: VIEW قراءة · INPUT إدخال/تعديل/إلغاء + تسجيل الإعداد · ADMIN كل ما سبق +
--      المراجعة والاعتماد + الإعدادات + الاستيراد + حذف عميل بلا حركات.
--      فصل الأشخاص: المراجع ≠ المُعد، والمعتمد ≠ المُعد والمراجع (بهوية حساب الدخول).
--   6) دوال RPC: تعديل/إلغاء/استعادة الحركات بسبب إلزامي، حفظ الإعدادات، اعتماد الفترات،
--      إلغاء الاعتماد، تصحيح اسم عميل، الاستيراد الأولي. (لا تحديث مباشر على الحركات أو الإعدادات.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) تسجيل الشاشة
-- ----------------------------------------------------------------------------
insert into public.screens (id, name, file, status, screen_type) values
  ('meat-guest-sales', 'محترف اللحوم – الرقابة اليومية للمبيعات والذمم', 'شاشة_محترف_اللحوم_الرقابة_اليومية.html', 'active', 'business')
on conflict (id) do nothing;

insert into public.user_screen_permissions (user_id, screen_id, permission)
select id, 'meat-guest-sales', 'ADMIN' from auth.users where email = 'mohabdalqader606@gmail.com'
on conflict (user_id, screen_id) do update set permission = excluded.permission;


-- ----------------------------------------------------------------------------
-- 2) دوال مساعدة
-- ----------------------------------------------------------------------------
-- مستوى صلاحية المستخدم الحالي على هذه الشاشة (NULL = لا دخول). مدير الصلاحيات = ADMIN.
create or replace function public.mp_gs_perm()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    when public.is_permissions_admin() then 'ADMIN'
    else (select u.permission from public.user_screen_permissions u
          where u.user_id = auth.uid() and u.screen_id = 'meat-guest-sales')
  end;
$$;

create or replace function public.mp_gs_can(lvl text)
returns boolean language sql stable security definer set search_path = public as $$
  select case lvl
    when 'VIEW'  then public.mp_gs_perm() in ('VIEW','INPUT','ADMIN')
    when 'INPUT' then public.mp_gs_perm() in ('INPUT','ADMIN')
    when 'ADMIN' then public.mp_gs_perm() = 'ADMIN'
    else false end;
$$;

-- اسم المستخدم الحالي كما يظهر في السجلات (من profiles، وإلا البريد)
create or replace function public.mp_gs_actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid()),
    (select u.email from auth.users u where u.id = auth.uid()),
    'غير معروف');
$$;

-- هوية وصلاحية المستخدم للواجهة (استدعاء واحد عند الدخول)
create or replace function public.mp_gs_me()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'name', public.mp_gs_actor_name(),
    'email', (select u.email from auth.users u where u.id = auth.uid()),
    'perm', public.mp_gs_perm(),
    'today', to_char((now() at time zone 'Asia/Amman')::date, 'YYYY-MM-DD'));
$$;

create or replace function public.mp_gs_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Amman')::date $$;


-- ----------------------------------------------------------------------------
-- 3) الجداول
-- ----------------------------------------------------------------------------
create table if not exists public.mp_gs_settings (
  id              smallint primary key default 1 check (id = 1),
  company         text not null default 'محترف اللحوم',
  open_date       date,
  open_amount     numeric(14,3) not null default 0,
  open_note       text not null default '',
  open_rev        int  not null default 0,
  open_detail     jsonb not null default '[]'::jsonb,
  change_reason   text,
  updated_by      uuid,
  updated_by_name text,
  updated_at      timestamptz not null default now()
);
insert into public.mp_gs_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.mp_gs_customers (
  id              text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  name            text not null unique check (length(btrim(name)) > 0),
  status          text not null default 'guest' check (status in ('guest','blocked')),
  note            text not null default '',
  created_at      timestamptz not null default now(),
  created_by      uuid,
  created_by_name text,
  updated_at      timestamptz,
  updated_by      uuid,
  updated_by_name text
);

create table if not exists public.mp_gs_transactions (
  id               text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  type             text not null check (type in ('inv','blk','ret','pay')),   -- blk = فاتورة عميل ذمم موقوف محمّلة على حساب الضيف
  doc_date         date not null,
  doc_no           text not null check (length(btrim(doc_no)) > 0),
  cust             text not null check (length(btrim(cust)) > 0),
  cust_status      text not null default 'unknown' check (cust_status in ('guest','blocked','unknown')),
  amount           numeric(14,3) not null check (amount > 0),
  note             text not null default '',
  dup_ack          boolean not null default false,
  migrated         boolean not null default false,
  rev              int not null default 0,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  created_by_name  text,
  modified_at      timestamptz,
  modified_by      uuid,
  modified_by_name text,
  modified_reason  text,
  voided_at        timestamptz,
  voided_by        uuid,
  voided_by_name   text,
  void_reason      text
);
create index if not exists idx_mp_gs_tx_date on public.mp_gs_transactions (doc_date);
create index if not exists idx_mp_gs_tx_no   on public.mp_gs_transactions (doc_no);

create table if not exists public.mp_gs_approvals (
  period_key       text primary key,
  period_from      date not null,
  period_to        date not null check (period_to >= period_from),
  prepared_by uuid, prepared_by_name text, prepared_at timestamptz,
  reviewed_by uuid, reviewed_by_name text, reviewed_at timestamptz,
  approved_by uuid, approved_by_name text, approved_at timestamptz,
  fp               text,
  close_amount     numeric(14,3),
  stale            boolean not null default false,
  stale_reason     text,
  stale_at         timestamptz,
  history          jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now(),
  check (period_key = to_char(period_from, 'YYYY-MM-DD') || '|' || to_char(period_to, 'YYYY-MM-DD'))
);

-- سجل التدقيق: إضافة فقط. لا توجد أي سياسة تعديل أو حذف لأي مستخدم.
create table if not exists public.mp_gs_audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_name  text,
  action      text not null,
  entity      text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  detail      text,
  source      text not null default 'server' check (source in ('server','client','local-import'))
);
create index if not exists idx_mp_gs_audit_entity on public.mp_gs_audit_log (entity, entity_id);


-- ----------------------------------------------------------------------------
-- 4) Triggers
-- ----------------------------------------------------------------------------
-- علم داخلي يضبطه الاستيراد الأولي فقط (داخل دالة SECURITY DEFINER) لتجاوز الختم التلقائي
create or replace function public.mp_gs_importing()
returns boolean language sql stable as $$ select coalesce(current_setting('mp_gs.importing', true), '') = 'on' $$;

create or replace function public.mp_gs_audit(p_action text, p_entity text, p_id text, p_before jsonb, p_after jsonb, p_reason text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('mp_gs.srv', 'on', true);
  insert into public.mp_gs_audit_log (actor, actor_name, action, entity, entity_id, before, after, reason, detail, source)
  values (auth.uid(), public.mp_gs_actor_name(), p_action, p_entity, p_id, p_before, p_after, p_reason, p_detail, 'server');
  perform set_config('mp_gs.srv', '', true);
end $$;

-- إسقاط الاعتماد لكل فترة مسجّلة تنتهي في/بعد تاريخ معين
create or replace function public.mp_gs_mark_stale(p_from date, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.mp_gs_approvals
     set stale = true, stale_reason = p_reason, stale_at = now(), updated_at = now()
   where prepared_by is not null and stale = false
     and (p_from is null or period_to >= p_from);
end $$;

-- ---- الحركات ----
create or replace function public.mp_gs_tx_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare biz_changed boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'الحذف النهائي للحركات غير مسموح. استخدم الإلغاء مع ذكر السبب.';
  end if;
  if public.mp_gs_importing() then return new; end if;

  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.created_by_name := public.mp_gs_actor_name();
    new.rev := 0; new.migrated := false;
    new.modified_at := null; new.modified_by := null; new.modified_by_name := null; new.modified_reason := null;
    new.voided_at := null; new.voided_by := null; new.voided_by_name := null; new.void_reason := null;
    return new;
  end if;

  -- UPDATE
  if new.id <> old.id or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by
     or new.created_by_name is distinct from old.created_by_name or new.migrated <> old.migrated then
    raise exception 'لا يمكن تعديل بيانات الإنشاء للحركة';
  end if;
  if new.rev <> old.rev + 1 then
    raise exception 'تعارض: الحركة عُدّلت من مستخدم آخر (rev %). أعد تحميل البيانات.', old.rev using errcode = 'PT409';
  end if;

  if old.voided_at is null and new.voided_at is not null then            -- إلغاء
    if coalesce(btrim(new.void_reason), '') = '' then raise exception 'سبب الإلغاء إلزامي'; end if;
    new.voided_at := now(); new.voided_by := auth.uid(); new.voided_by_name := public.mp_gs_actor_name();
    new.type := old.type; new.doc_date := old.doc_date; new.doc_no := old.doc_no; new.cust := old.cust;
    new.amount := old.amount; new.note := old.note; new.cust_status := old.cust_status;
    new.modified_at := old.modified_at; new.modified_by := old.modified_by; new.modified_by_name := old.modified_by_name; new.modified_reason := old.modified_reason;
    return new;
  end if;
  if old.voided_at is not null and new.voided_at is null then            -- استعادة
    if coalesce(btrim(new.modified_reason), '') = '' or new.modified_reason is not distinct from old.modified_reason then
      raise exception 'سبب الاستعادة إلزامي';
    end if;
    new.voided_by := null; new.voided_by_name := null; new.void_reason := null;
    new.modified_at := now(); new.modified_by := auth.uid(); new.modified_by_name := public.mp_gs_actor_name();
    return new;
  end if;
  if old.voided_at is not null then
    raise exception 'لا يمكن تعديل حركة ملغاة. استعدها أولاً.';
  end if;
  if new.voided_by is distinct from old.voided_by or new.void_reason is distinct from old.void_reason then
    raise exception 'بيانات الإلغاء لا تُعدّل مباشرة';
  end if;

  biz_changed := (new.type, new.doc_date, new.doc_no, new.cust, new.amount, new.note, new.cust_status)
                 is distinct from (old.type, old.doc_date, old.doc_no, old.cust, old.amount, old.note, old.cust_status);
  if biz_changed or new.dup_ack is distinct from old.dup_ack then
    if coalesce(btrim(new.modified_reason), '') = '' then raise exception 'سبب التعديل إلزامي'; end if;
  end if;
  new.modified_at := now(); new.modified_by := auth.uid(); new.modified_by_name := public.mp_gs_actor_name();
  return new;
end $$;

create or replace function public.mp_gs_tx_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare act text; rsn text;
begin
  if public.mp_gs_importing() then return null; end if;
  if tg_op = 'INSERT' then
    perform public.mp_gs_audit('TX_ADD', 'transaction', new.id, null, to_jsonb(new), null, null);
    perform public.mp_gs_mark_stale(new.doc_date, 'أُضيفت حركة ' || new.doc_no || ' بتاريخ ' || new.doc_date);
    return null;
  end if;
  if old.voided_at is null and new.voided_at is not null then act := 'TX_VOID'; rsn := new.void_reason;
  elsif old.voided_at is not null and new.voided_at is null then act := 'TX_RESTORE'; rsn := new.modified_reason;
  else act := 'TX_EDIT'; rsn := new.modified_reason; end if;
  perform public.mp_gs_audit(act, 'transaction', new.id, to_jsonb(old), to_jsonb(new), rsn, null);
  perform public.mp_gs_mark_stale(least(old.doc_date, new.doc_date), act || ' للمستند ' || new.doc_no);
  return null;
end $$;

drop trigger if exists trg_mp_gs_tx_before on public.mp_gs_transactions;
create trigger trg_mp_gs_tx_before before insert or update or delete on public.mp_gs_transactions
  for each row execute function public.mp_gs_tx_before();
drop trigger if exists trg_mp_gs_tx_after on public.mp_gs_transactions;
create trigger trg_mp_gs_tx_after after insert or update on public.mp_gs_transactions
  for each row execute function public.mp_gs_tx_after();

-- ---- العملاء ----
create or replace function public.mp_gs_cust_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.mp_gs_importing() then
    if tg_op = 'DELETE' then return old; end if; return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now(); new.created_by := auth.uid(); new.created_by_name := public.mp_gs_actor_name();
    new.updated_at := null; new.updated_by := null; new.updated_by_name := null;
    perform public.mp_gs_audit('CUST_ADD', 'customer', new.id, null, to_jsonb(new), null, null);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.name <> old.name and coalesce(current_setting('mp_gs.renaming', true), '') <> 'on' then
      raise exception 'تصحيح اسم العميل يتم عبر الدالة mp_gs_rename_customer فقط (لتحديث حركاته معه)';
    end if;
    new.created_at := old.created_at; new.created_by := old.created_by; new.created_by_name := old.created_by_name;
    new.updated_at := now(); new.updated_by := auth.uid(); new.updated_by_name := public.mp_gs_actor_name();
    perform public.mp_gs_audit(case when new.status <> old.status then 'CUST_STATUS' when new.name <> old.name then 'CUST_RENAME' else 'CUST_EDIT' end,
                               'customer', new.id, to_jsonb(old), to_jsonb(new), null, null);
    return new;
  else
    if exists (select 1 from public.mp_gs_transactions t where t.cust = old.name) then
      raise exception 'لا يمكن حذف عميل له حركات (حتى الملغاة)';
    end if;
    perform public.mp_gs_audit('CUST_DEL', 'customer', old.id, to_jsonb(old), null, null, null);
    return old;
  end if;
end $$;
drop trigger if exists trg_mp_gs_cust on public.mp_gs_customers;
create trigger trg_mp_gs_cust before insert or update or delete on public.mp_gs_customers
  for each row execute function public.mp_gs_cust_trg();

-- ---- الإعدادات والرصيد الافتتاحي ----
create or replace function public.mp_gs_settings_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare open_changed boolean;
begin
  if tg_op = 'DELETE' then raise exception 'لا يمكن حذف الإعدادات'; end if;
  if public.mp_gs_importing() then return new; end if;
  new.id := 1;
  open_changed := (new.open_date, new.open_amount, new.open_note) is distinct from (old.open_date, old.open_amount, old.open_note);
  if open_changed then
    if old.open_date is not null and coalesce(btrim(new.change_reason), '') = '' then
      raise exception 'سبب تغيير الرصيد الافتتاحي إلزامي';
    end if;
    new.open_rev := old.open_rev + 1;
  else
    new.open_rev := old.open_rev;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid(); new.updated_by_name := public.mp_gs_actor_name();
  perform public.mp_gs_audit(case when open_changed then 'OPEN_SET' else 'SETTINGS' end, 'settings', '1',
    jsonb_build_object('company', old.company, 'openDate', old.open_date, 'openAmount', old.open_amount, 'openNote', old.open_note),
    jsonb_build_object('company', new.company, 'openDate', new.open_date, 'openAmount', new.open_amount, 'openNote', new.open_note),
    new.change_reason, null);
  if open_changed then perform public.mp_gs_mark_stale(null, 'تغيّر الرصيد الافتتاحي'); end if;
  return new;
end $$;
drop trigger if exists trg_mp_gs_settings on public.mp_gs_settings;
create trigger trg_mp_gs_settings before update or delete on public.mp_gs_settings
  for each row execute function public.mp_gs_settings_trg();

-- ---- سجل التدقيق: لا تعديل ولا حذف حتى للمالك عبر الواجهة ----
create or replace function public.mp_gs_audit_immutable()
returns trigger language plpgsql as $$
begin raise exception 'سجل التدقيق غير قابل للتعديل أو الحذف'; end $$;
drop trigger if exists trg_mp_gs_audit_immutable on public.mp_gs_audit_log;
create trigger trg_mp_gs_audit_immutable before update or delete on public.mp_gs_audit_log
  for each row execute function public.mp_gs_audit_immutable();

create or replace function public.mp_gs_audit_client_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- مصدر server يُسمح به فقط من داخل mp_gs_audit، وlocal-import فقط من داخل mp_gs_import
  if public.mp_gs_importing() or coalesce(current_setting('mp_gs.srv', true), '') = 'on' then return new; end if;
  new.at := now(); new.actor := auth.uid(); new.actor_name := public.mp_gs_actor_name(); new.source := 'client';
  return new;
end $$;
drop trigger if exists trg_mp_gs_audit_stamp on public.mp_gs_audit_log;
create trigger trg_mp_gs_audit_stamp before insert on public.mp_gs_audit_log
  for each row execute function public.mp_gs_audit_client_stamp();


-- ----------------------------------------------------------------------------
-- 5) RLS
-- ----------------------------------------------------------------------------
alter table public.mp_gs_settings     enable row level security;
alter table public.mp_gs_customers    enable row level security;
alter table public.mp_gs_transactions enable row level security;
alter table public.mp_gs_approvals    enable row level security;
alter table public.mp_gs_audit_log    enable row level security;

drop policy if exists mp_gs_settings_select on public.mp_gs_settings;
drop policy if exists mp_gs_settings_update on public.mp_gs_settings;
create policy mp_gs_settings_select on public.mp_gs_settings for select using (public.mp_gs_can('VIEW'));
-- لا سياسة UPDATE: التعديل عبر mp_gs_settings_save فقط (السبب معامل إلزامي في كل استدعاء)

drop policy if exists mp_gs_cust_select on public.mp_gs_customers;
drop policy if exists mp_gs_cust_insert on public.mp_gs_customers;
drop policy if exists mp_gs_cust_update on public.mp_gs_customers;
drop policy if exists mp_gs_cust_delete on public.mp_gs_customers;
create policy mp_gs_cust_select on public.mp_gs_customers for select using (public.mp_gs_can('VIEW'));
create policy mp_gs_cust_insert on public.mp_gs_customers for insert with check (public.mp_gs_can('INPUT'));
create policy mp_gs_cust_update on public.mp_gs_customers for update using (public.mp_gs_can('INPUT')) with check (public.mp_gs_can('INPUT'));
create policy mp_gs_cust_delete on public.mp_gs_customers for delete using (public.mp_gs_can('ADMIN'));

drop policy if exists mp_gs_tx_select on public.mp_gs_transactions;
drop policy if exists mp_gs_tx_insert on public.mp_gs_transactions;
drop policy if exists mp_gs_tx_update on public.mp_gs_transactions;
create policy mp_gs_tx_select on public.mp_gs_transactions for select using (public.mp_gs_can('VIEW'));
create policy mp_gs_tx_insert on public.mp_gs_transactions for insert with check (public.mp_gs_can('INPUT'));
-- لا سياسة UPDATE: التعديل والإلغاء والاستعادة عبر دوال RPC فقط، والسبب معامل إلزامي في كل استدعاء
-- (يمنع مرور تعديل جديد بسبب قديم بقي محفوظاً في العمود)
-- لا سياسة DELETE: الحذف النهائي ممنوع (والـ Trigger يمنعه أيضاً)

drop policy if exists mp_gs_appr_select on public.mp_gs_approvals;
create policy mp_gs_appr_select on public.mp_gs_approvals for select using (public.mp_gs_can('VIEW'));
-- لا سياسة كتابة: الاعتماد يتم فقط عبر دوال RPC أدناه

drop policy if exists mp_gs_audit_select on public.mp_gs_audit_log;
drop policy if exists mp_gs_audit_insert on public.mp_gs_audit_log;
create policy mp_gs_audit_select on public.mp_gs_audit_log for select using (public.mp_gs_can('VIEW'));
create policy mp_gs_audit_insert on public.mp_gs_audit_log for insert with check (public.mp_gs_can('INPUT') and source = 'client');

revoke update, delete, truncate on public.mp_gs_audit_log from anon, authenticated;
revoke update, delete, truncate on public.mp_gs_transactions from anon, authenticated;
revoke insert, update, delete, truncate on public.mp_gs_settings from anon, authenticated;
revoke insert, update, delete, truncate on public.mp_gs_approvals from anon, authenticated;
revoke all on public.mp_gs_settings, public.mp_gs_customers, public.mp_gs_transactions, public.mp_gs_approvals, public.mp_gs_audit_log from anon;


-- ----------------------------------------------------------------------------
-- 6) دوال RPC
-- ----------------------------------------------------------------------------
-- تسجيل خطوة (prepared | reviewed | approved) لفترة. البصمة والرصيد يحسبهما المحرك في الواجهة؛
-- الخادم يفرض: الصلاحية، التسلسل، فصل الأشخاص، منع الفترات المستقبلية، والأرشفة عند الإسقاط.
create or replace function public.mp_gs_approval_step(p_from date, p_to date, p_step text, p_fp text, p_close numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := to_char(p_from,'YYYY-MM-DD') || '|' || to_char(p_to,'YYYY-MM-DD');
        r public.mp_gs_approvals; me uuid := auth.uid(); nm text := public.mp_gs_actor_name(); arch jsonb;
begin
  if me is null then raise exception 'غير مسجّل الدخول'; end if;
  if p_step not in ('prepared','reviewed','approved') then raise exception 'خطوة غير معروفة'; end if;
  if p_step = 'prepared' and not public.mp_gs_can('INPUT') then raise exception 'صلاحيتك لا تسمح بتسجيل الإعداد'; end if;
  if p_step in ('reviewed','approved') and not public.mp_gs_can('ADMIN') then raise exception 'المراجعة والاعتماد تتطلب صلاحية ADMIN'; end if;
  if p_to < p_from then raise exception 'تاريخ البداية بعد النهاية'; end if;
  if p_to > public.mp_gs_today() then raise exception 'لا يمكن تسجيل فترة تنتهي بعد اليوم'; end if;
  if coalesce(p_fp,'') = '' then raise exception 'البصمة مفقودة'; end if;

  insert into public.mp_gs_approvals (period_key, period_from, period_to) values (k, p_from, p_to) on conflict (period_key) do nothing;
  select * into r from public.mp_gs_approvals where period_key = k for update;

  -- فترة سقطت حالتها أو إعادة إعداد: تُؤرشف الدورة الحالية ثم تبدأ دورة جديدة
  if (r.stale or p_step = 'prepared' or (r.fp is not null and r.fp <> p_fp)) and r.prepared_by is not null then
    arch := jsonb_build_object(
      'prepared', jsonb_build_object('by', r.prepared_by_name, 'uid', r.prepared_by, 'at', r.prepared_at),
      'reviewed', case when r.reviewed_by is null then null else jsonb_build_object('by', r.reviewed_by_name, 'uid', r.reviewed_by, 'at', r.reviewed_at) end,
      'approved', case when r.approved_by is null then null else jsonb_build_object('by', r.approved_by_name, 'uid', r.approved_by, 'at', r.approved_at) end,
      'close', r.close_amount, 'closedAt', now(),
      'why', case when r.stale then coalesce(r.stale_reason, 'تغيّرت البيانات') when r.fp <> p_fp then 'تغيّرت البيانات (بصمة مختلفة)' else 'إعادة إعداد' end);
    update public.mp_gs_approvals set history = history || jsonb_build_array(arch),
      prepared_by=null, prepared_by_name=null, prepared_at=null, reviewed_by=null, reviewed_by_name=null, reviewed_at=null,
      approved_by=null, approved_by_name=null, approved_at=null, stale=false, stale_reason=null, stale_at=null
      where period_key = k returning * into r;
  end if;

  if p_step = 'reviewed' then
    if r.prepared_by is null then raise exception 'سجّل الإعداد أولاً'; end if;
    if r.prepared_by = me then raise exception 'فصل المهام: لا يمكن لمن سجّل الإعداد أن يسجّل المراجعة'; end if;
  elsif p_step = 'approved' then
    if r.reviewed_by is null then raise exception 'يجب تسجيل المراجعة قبل الاعتماد'; end if;
    if me in (r.prepared_by, r.reviewed_by) then raise exception 'فصل المهام: الاعتماد يجب أن يكون من شخص مختلف عن المُعد والمراجع'; end if;
  end if;

  update public.mp_gs_approvals set
    prepared_by      = case when p_step='prepared' then me  else prepared_by end,
    prepared_by_name = case when p_step='prepared' then nm  else prepared_by_name end,
    prepared_at      = case when p_step='prepared' then now() else prepared_at end,
    reviewed_by      = case when p_step='reviewed' then me  else reviewed_by end,
    reviewed_by_name = case when p_step='reviewed' then nm  else reviewed_by_name end,
    reviewed_at      = case when p_step='reviewed' then now() else reviewed_at end,
    approved_by      = case when p_step='approved' then me  else approved_by end,
    approved_by_name = case when p_step='approved' then nm  else approved_by_name end,
    approved_at      = case when p_step='approved' then now() else approved_at end,
    fp = p_fp, close_amount = p_close, stale = false, stale_reason = null, stale_at = null, updated_at = now()
  where period_key = k returning * into r;

  perform public.mp_gs_audit('APPROVAL', 'approval', k, null, to_jsonb(r) - 'history', null,
    p_step || ' – الرصيد ' || p_close || case when jsonb_array_length(r.history) > 0 then ' (دورة ' || (jsonb_array_length(r.history)+1) || ')' else '' end);
  return to_jsonb(r);
end $$;

create or replace function public.mp_gs_approval_reset(p_from date, p_to date, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text := to_char(p_from,'YYYY-MM-DD') || '|' || to_char(p_to,'YYYY-MM-DD'); r public.mp_gs_approvals;
begin
  if not public.mp_gs_can('ADMIN') then raise exception 'إلغاء التسجيلات يتطلب صلاحية ADMIN'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'السبب إلزامي'; end if;
  select * into r from public.mp_gs_approvals where period_key = k for update;
  if r.prepared_by is null then return to_jsonb(r); end if;
  update public.mp_gs_approvals set history = history || jsonb_build_array(jsonb_build_object(
      'prepared', jsonb_build_object('by', r.prepared_by_name, 'uid', r.prepared_by, 'at', r.prepared_at),
      'reviewed', case when r.reviewed_by is null then null else jsonb_build_object('by', r.reviewed_by_name, 'at', r.reviewed_at) end,
      'approved', case when r.approved_by is null then null else jsonb_build_object('by', r.approved_by_name, 'at', r.approved_at) end,
      'close', r.close_amount, 'closedAt', now(), 'why', 'إلغاء يدوي: ' || p_reason)),
    prepared_by=null, prepared_by_name=null, prepared_at=null, reviewed_by=null, reviewed_by_name=null, reviewed_at=null,
    approved_by=null, approved_by_name=null, approved_at=null, fp=null, close_amount=null, stale=false, stale_reason=null, stale_at=null, updated_at=now()
  where period_key = k returning * into r;
  perform public.mp_gs_audit('APPROVAL_RESET', 'approval', k, null, null, p_reason, null);
  return to_jsonb(r);
end $$;

-- تعديل حركة: p_patch يحمل الحقول المسموح تعديلها فقط. p_rev = رقم المراجعة الذي رآه المستخدم (قفل تفاؤلي).
create or replace function public.mp_gs_tx_update(p_id text, p_rev int, p_patch jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.mp_gs_transactions;
begin
  if not public.mp_gs_can('INPUT') then raise exception 'صلاحيتك لا تسمح بتعديل الحركات'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'سبب التعديل إلزامي'; end if;
  select * into t from public.mp_gs_transactions where id = p_id for update;
  if t.id is null then raise exception 'الحركة غير موجودة'; end if;
  if t.rev <> p_rev then raise exception 'تعارض: الحركة عُدّلت من مستخدم آخر. أعد تحميل البيانات.' using errcode = 'PT409'; end if;
  if t.voided_at is not null then raise exception 'لا يمكن تعديل حركة ملغاة. استعدها أولاً.'; end if;
  if (coalesce(p_patch->>'type', t.type), coalesce((p_patch->>'date')::date, t.doc_date), coalesce(p_patch->>'no', t.doc_no),
      coalesce(p_patch->>'cust', t.cust), coalesce(p_patch->>'custStatus', t.cust_status), coalesce((p_patch->>'amount')::numeric, t.amount),
      coalesce(p_patch->>'note', t.note), coalesce((p_patch->>'dupAck')::boolean, t.dup_ack))
     is not distinct from (t.type, t.doc_date, t.doc_no, t.cust, t.cust_status, t.amount, t.note, t.dup_ack) then
    raise exception 'لا يوجد أي تغيير في الحقول القابلة للتعديل';
  end if;
  update public.mp_gs_transactions set
    type        = coalesce(p_patch->>'type', type),
    doc_date    = coalesce((p_patch->>'date')::date, doc_date),
    doc_no      = coalesce(p_patch->>'no', doc_no),
    cust        = coalesce(p_patch->>'cust', cust),
    cust_status = coalesce(p_patch->>'custStatus', cust_status),
    amount      = coalesce((p_patch->>'amount')::numeric, amount),
    note        = coalesce(p_patch->>'note', note),
    dup_ack     = coalesce((p_patch->>'dupAck')::boolean, dup_ack),
    rev = rev + 1, modified_reason = p_reason
  where id = p_id returning * into t;
  return to_jsonb(t);
end $$;

create or replace function public.mp_gs_tx_void(p_id text, p_rev int, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.mp_gs_transactions;
begin
  if not public.mp_gs_can('INPUT') then raise exception 'صلاحيتك لا تسمح بإلغاء الحركات'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'سبب الإلغاء إلزامي'; end if;
  select * into t from public.mp_gs_transactions where id = p_id for update;
  if t.id is null then raise exception 'الحركة غير موجودة'; end if;
  if t.rev <> p_rev then raise exception 'تعارض: الحركة عُدّلت من مستخدم آخر. أعد تحميل البيانات.' using errcode = 'PT409'; end if;
  if t.voided_at is not null then raise exception 'الحركة ملغاة مسبقاً'; end if;
  update public.mp_gs_transactions set voided_at = now(), void_reason = p_reason, rev = rev + 1 where id = p_id returning * into t;
  return to_jsonb(t);
end $$;

create or replace function public.mp_gs_tx_restore(p_id text, p_rev int, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.mp_gs_transactions;
begin
  if not public.mp_gs_can('INPUT') then raise exception 'صلاحيتك لا تسمح باستعادة الحركات'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'سبب الاستعادة إلزامي'; end if;
  select * into t from public.mp_gs_transactions where id = p_id for update;
  if t.id is null then raise exception 'الحركة غير موجودة'; end if;
  if t.rev <> p_rev then raise exception 'تعارض: الحركة عُدّلت من مستخدم آخر. أعد تحميل البيانات.' using errcode = 'PT409'; end if;
  if t.voided_at is null then raise exception 'الحركة غير ملغاة'; end if;
  update public.mp_gs_transactions set voided_at = null, modified_reason = p_reason, rev = rev + 1 where id = p_id returning * into t;
  return to_jsonb(t);
end $$;

-- حفظ الإعدادات والرصيد الافتتاحي (ADMIN). السبب إلزامي عند تغيير رصيد مضبوط سابقاً.
create or replace function public.mp_gs_settings_save(p_company text, p_open_date date, p_open_amount numeric, p_open_note text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.mp_gs_settings;
begin
  if not public.mp_gs_can('ADMIN') then raise exception 'الإعدادات تتطلب صلاحية ADMIN'; end if;
  if p_open_date is null then raise exception 'تاريخ الرصيد الافتتاحي إلزامي'; end if;
  select * into s from public.mp_gs_settings where id = 1 for update;
  if s.open_date is not null and (p_open_date, p_open_amount, coalesce(p_open_note,'')) is distinct from (s.open_date, s.open_amount, s.open_note)
     and coalesce(btrim(p_reason),'') = '' then
    raise exception 'سبب تغيير الرصيد الافتتاحي إلزامي';
  end if;
  update public.mp_gs_settings set company = coalesce(nullif(btrim(p_company),''), 'محترف اللحوم'), open_date = p_open_date,
    open_amount = coalesce(p_open_amount, 0), open_note = coalesce(p_open_note, ''), change_reason = nullif(btrim(coalesce(p_reason,'')), '')
  where id = 1 returning * into s;
  return to_jsonb(s);
end $$;

-- تصحيح اسم عميل مع كل حركاته في عملية واحدة
create or replace function public.mp_gs_rename_customer(p_id text, p_new_name text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.mp_gs_customers; nn text := btrim(regexp_replace(coalesce(p_new_name,''), '\s+', ' ', 'g'));
begin
  if not public.mp_gs_can('INPUT') then raise exception 'صلاحيتك لا تسمح بتعديل العملاء'; end if;
  if nn = '' then raise exception 'الاسم الجديد فارغ'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'السبب إلزامي'; end if;
  select * into c from public.mp_gs_customers where id = p_id for update;
  if c.id is null then raise exception 'العميل غير موجود'; end if;
  if nn = c.name then return; end if;
  if exists (select 1 from public.mp_gs_customers where name = nn) then raise exception 'يوجد عميل بهذا الاسم'; end if;
  perform set_config('mp_gs.renaming', 'on', true);
  update public.mp_gs_customers set name = nn where id = p_id;
  perform set_config('mp_gs.renaming', '', true);
  update public.mp_gs_transactions set cust = nn, rev = rev + 1,
         modified_reason = 'تصحيح اسم العميل «' || c.name || '» إلى «' || nn || '»: ' || p_reason
   where cust = c.name and voided_at is null;
  -- الحركات الملغاة: يُحدَّث الاسم دون المرور بمسار التعديل (لا تعديل على حركة ملغاة عبر الواجهة)
  perform set_config('mp_gs.importing', 'on', true);
  update public.mp_gs_transactions set cust = nn, rev = rev + 1 where cust = c.name and voided_at is not null;
  perform set_config('mp_gs.importing', '', true);
  perform public.mp_gs_audit('CUST_RENAME', 'customer', p_id, jsonb_build_object('name', c.name), jsonb_build_object('name', nn), p_reason, null);
  perform public.mp_gs_mark_stale((select min(doc_date) from public.mp_gs_transactions where cust = nn), 'تصحيح اسم عميل');
end $$;

-- الاستيراد الأولي من ملف النسخة الاحتياطية للأداة المحلية (بعد ترحيله بمحرك الواجهة إلى الصيغة 2).
-- مسموح فقط لـ ADMIN وفقط إذا كان جدول الحركات فارغاً (لا دمج ولا استبدال لبيانات مركزية قائمة).
create or replace function public.mp_gs_import(p jsonb, p_file_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_tx int; n_c int; n_a int; t jsonb; c jsonb; a jsonb; k text; s jsonb := '{}'::jsonb;
begin
  if not public.mp_gs_can('ADMIN') then raise exception 'الاستيراد يتطلب صلاحية ADMIN'; end if;
  if exists (select 1 from public.mp_gs_transactions) then
    raise exception 'الاستيراد الأولي مسموح فقط عندما لا توجد حركات مركزية. البيانات الحالية لم تتغير.';
  end if;
  perform set_config('mp_gs.importing', 'on', true);

  update public.mp_gs_settings set
    company = coalesce(nullif(p->>'company',''), 'محترف اللحوم'),
    open_date = nullif(p->>'openDate','')::date,
    open_amount = coalesce((p->>'openAmount')::numeric, 0),
    open_note = coalesce(p->>'openNote',''),
    open_rev = coalesce((p->>'openRev')::int, 0),
    open_detail = coalesce(p->'openDetail', '[]'::jsonb),
    change_reason = 'استيراد أولي من «' || coalesce(p_file_name,'') || '»',
    updated_by = auth.uid(), updated_by_name = public.mp_gs_actor_name(), updated_at = now()
  where id = 1;

  for c in select * from jsonb_array_elements(coalesce(p->'customers','[]'::jsonb)) loop
    insert into public.mp_gs_customers (id, name, status, note, created_at, created_by, created_by_name)
    values (c->>'id', c->>'name', coalesce(nullif(c->>'status',''),'guest'), coalesce(c->>'note',''),
            coalesce((c->>'created')::timestamptz, now()), auth.uid(), 'مُرحّل من الأداة المحلية');
  end loop;

  for t in select * from jsonb_array_elements(p->'tx') loop
    insert into public.mp_gs_transactions (id, type, doc_date, doc_no, cust, cust_status, amount, note, dup_ack, migrated, rev,
      created_at, created_by, created_by_name, modified_at, modified_by_name, modified_reason, voided_at, voided_by_name, void_reason)
    values (t->>'id', t->>'type', (t->>'date')::date, t->>'no', t->>'cust', coalesce(nullif(t->>'custStatus',''),'unknown'),
      (t->>'amount')::numeric, coalesce(t->>'note',''), coalesce((t->>'dupAck')::boolean,false), true, coalesce((t->>'rev')::int,0),
      coalesce((t->>'created')::timestamptz, now()), auth.uid(), coalesce(nullif(t->>'createdBy',''), 'غير معروف (مُرحّل)'),
      (t->'modified'->>'at')::timestamptz, t->'modified'->>'by', t->'modified'->>'reason',
      (t->'voided'->>'at')::timestamptz, t->'voided'->>'by', t->'voided'->>'reason');
  end loop;

  -- سجل التعديلات المحلي يُحفظ كما هو بمصدر local-import
  for a in select * from jsonb_array_elements(coalesce(p->'audit','[]'::jsonb)) loop
    insert into public.mp_gs_audit_log (at, actor, actor_name, action, entity, entity_id, before, after, reason, detail, source)
    values (coalesce((a->>'at')::timestamptz, now()), null, coalesce(nullif(a->>'by',''), '—'), coalesce(a->>'action','LOCAL'),
            'local', a->>'txId', a->'before', a->'after', a->>'reason', a->>'detail', 'local-import');
  end loop;

  -- الاعتمادات المحلية تُحفظ كتاريخ فقط (توقيعات بالاسم غير موثّقة بحساب دخول) ولا تُعتبر اعتماداً سارياً
  for k in select jsonb_object_keys(coalesce(p->'approvals','{}'::jsonb)) loop
    a := p->'approvals'->k;
    if k ~ '^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$' then
      insert into public.mp_gs_approvals (period_key, period_from, period_to, history)
      values (k, split_part(k,'|',1)::date, split_part(k,'|',2)::date,
        coalesce(a->'history','[]'::jsonb) || case when a ? 'prepared' and a->'prepared' is not null and a->'prepared' <> 'null'::jsonb
          then jsonb_build_array(jsonb_build_object('prepared', a->'prepared', 'reviewed', a->'reviewed', 'approved', a->'approved',
               'close', a->'close', 'closedAt', now(), 'why', 'مستورد من الأداة المحلية – توقيعات بالاسم غير موثّقة بحساب دخول'))
          else '[]'::jsonb end)
      on conflict (period_key) do nothing;
    end if;
  end loop;

  perform set_config('mp_gs.importing', '', true);
  select count(*) into n_tx from public.mp_gs_transactions;
  select count(*) into n_c from public.mp_gs_customers;
  select count(*) into n_a from public.mp_gs_audit_log where source = 'local-import';
  select jsonb_object_agg(type, total) into s from (
    select type, sum(amount) total from public.mp_gs_transactions where voided_at is null group by type) x;
  perform public.mp_gs_audit('IMPORT', 'system', null, null, jsonb_build_object('tx', n_tx, 'customers', n_c, 'auditLines', n_a, 'totals', s),
    null, 'استيراد أولي من «' || coalesce(p_file_name,'') || '»');
  return jsonb_build_object('tx', n_tx, 'customers', n_c, 'audit', n_a, 'totals', coalesce(s,'{}'::jsonb));
end $$;

revoke execute on function public.mp_gs_approval_step(date,date,text,text,numeric), public.mp_gs_approval_reset(date,date,text),
  public.mp_gs_tx_update(text,int,jsonb,text), public.mp_gs_tx_void(text,int,text), public.mp_gs_tx_restore(text,int,text),
  public.mp_gs_settings_save(text,date,numeric,text,text),
  public.mp_gs_rename_customer(text,text,text), public.mp_gs_import(jsonb,text), public.mp_gs_me(),
  public.mp_gs_audit(text,text,text,jsonb,jsonb,text,text), public.mp_gs_mark_stale(date,text) from public, anon;
grant execute on function public.mp_gs_approval_step(date,date,text,text,numeric), public.mp_gs_approval_reset(date,date,text),
  public.mp_gs_tx_update(text,int,jsonb,text), public.mp_gs_tx_void(text,int,text), public.mp_gs_tx_restore(text,int,text),
  public.mp_gs_settings_save(text,date,numeric,text,text),
  public.mp_gs_rename_customer(text,text,text), public.mp_gs_import(jsonb,text), public.mp_gs_me() to authenticated;
revoke execute on function public.mp_gs_audit(text,text,text,jsonb,jsonb,text,text), public.mp_gs_mark_stale(date,text) from authenticated;


-- ============================================================================
-- استعلامات تحقق بعد التشغيل (تُشغَّل يدوياً — قراءة فقط)
-- ============================================================================
-- select * from public.screens where id = 'meat-guest-sales';
-- select u.email, p.permission from public.user_screen_permissions p join auth.users u on u.id = p.user_id where p.screen_id = 'meat-guest-sales';
-- select tablename, policyname, cmd from pg_policies where tablename like 'mp_gs_%' order by 1, 2;
--
-- ⚠️ تحقق مهم يخص البوابة (index.html) وليس هذا التطبيق:
-- البوابة تقرأ صفوف user_screen_permissions الخاصة بالمستخدم لتقرر أي بطاقات تظهر. ملفات SQL
-- في المستودع لا تحتوي سياسة تسمح للمستخدم العادي بقراءة صفوفه هو. شغّل:
--   select policyname, cmd, qual from pg_policies where tablename = 'user_screen_permissions';
-- إذا لم تظهر سياسة تسمح بـ user_id = auth.uid()، فالمستخدم العادي لن يرى بطاقة التطبيق في
-- البوابة (لكنه يستطيع فتح الشاشة مباشرة، لأن هذا التطبيق يقرأ الصلاحية عبر mp_gs_me()).
-- الحل المقترح (غير مُنفَّذ هنا لأنه يغيّر سياسة جدول مشترك — شغّله بقرار منك فقط):
--   create policy usp_own_select on public.user_screen_permissions for select using (user_id = auth.uid());
-- ============================================================================
-- END OF BATCH 8
-- ============================================================================
