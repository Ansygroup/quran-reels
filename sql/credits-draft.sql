-- ============================================================
-- مسودة رصيد/خطط الدفع (كمل#14) — غير مُطبَّقة على القاعدة النشطة.
-- تُفعَّل فقط بعد اختيار المزوّد (انظر docs/payments-setup.md):
--   psql أو Supabase SQL Editor → الصق هذا كاملاً.
-- المبدأ: المجاني يبقى بلا حدّ — الخطة المتقدمة تضيف أتمتة/أولوية فقط.
-- ============================================================

create table if not exists public.plans (
  id text primary key,                 -- 'free' | 'pro' | 'team'
  name_ar text not null,
  price_cents integer not null default 0,
  currency text not null default 'usd',
  features jsonb not null default '[]'::jsonb
);

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  plan text not null default 'free' references public.plans(id),
  updated_at timestamptz not null default now()
);

-- سجل الحركات (تدقيق)
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,                -- 'topup_manual' | 'purchase' | 'usage' | 'grant'
  ref text,
  created_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.plans enable row level security;

create policy "plans readable" on public.plans for select using (true);
create policy "own credits read" on public.user_credits for select using (auth.uid() = user_id);
create policy "own ledger read" on public.credit_ledger for select using (auth.uid() = user_id);

-- خصم رصيد آمن (definer) — يُستدعى من دالة JS عند النشر المتقدّم
create or replace function public.spend_credits(p_amount integer, p_reason text)
returns integer language plpgsql security definer as $$
declare b integer;
begin
  update public.user_credits
     set balance = balance - p_amount, updated_at = now()
   where user_id = auth.uid() and balance >= p_amount
   returning balance into b;
  if b is null then return -1; end if;
  insert into public.credit_ledger(user_id, delta, reason) values (auth.uid(), -p_amount, p_reason);
  return b;
end $$;

insert into public.plans (id, name_ar, price_cents, features) values
  ('free', 'مجانية', 0, '["بدون حدود للفيديوهات","بدون علامة مائية","32 أداة","MCP"]'),
  ('pro', 'متقدمة', 499, '["كل المجانية","أولوية معالجة سحابية","أتمتة نشر متقدمة","دعم مباشر"]')
on conflict (id) do nothing;
