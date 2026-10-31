-- ============================================================================
-- BATCH 13: شاشة "عينات المصروفات" — الكشوفات الكبيرة (أكثر من 15,000 سطر)
-- ============================================================================
-- يُشغَّل يدوياً على Supabase SQL Editor (آمن لإعادة التنفيذ). يعتمد على Batch 9.
-- من الإصدار v2.25 الكشوفات الكبيرة لا تُنزَّل كاملة على الجهاز، بل عيناتها فقط،
-- ومجاميع كل مجموعة (عدد السطور والمبلغ) تأتي من هذه الدالة، والبحث يتم على السيرفر.
-- ============================================================================

create or replace function public.exp_sample_group_stats(p_statement text)
returns table(acct text, exp text, n bigint, amt numeric)
language sql stable security invoker set search_path = public as $$
  select coalesce(data->>'acct','') as acct,
         min(coalesce(data->>'exp','')) as exp,
         count(*) as n,
         coalesce(sum(nullif(data->>'net','')::numeric),0) as amt
  from public.expense_sample_rows
  where statement_id = p_statement
  group by data->>'acct'
$$;
grant execute on function public.exp_sample_group_stats(text) to authenticated;

-- فهارس تسرّع تحميل العينات والبحث داخل مجموعة
create index if not exists idx_exp_sample_rows_st_sel on public.expense_sample_rows(statement_id) where sel;
create index if not exists idx_exp_sample_rows_st_acct on public.expense_sample_rows(statement_id, (data->>'acct'));
