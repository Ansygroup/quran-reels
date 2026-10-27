-- ============================================================
-- Quran Reels — نسخة مخطط قاعدة البيانات (استُخرجت من الكتالوج الحي)
-- project: lbblhpscncqsyzvuujpw · schema: public + سياسات storage
-- التوليد: pg_catalog (information_schema/policies/indexes)
-- ملاحظات الاستعادة على Supabase:
--   1) نفّذ هذا الملف على مشروع Supabase جديد (auth/storage schema يُنشأ تلقائيًا).
--   2) أنشئ حاوية التخزين `reels` (public) ثم نفّذ سياسات storage.objects أدناه.
--   3) الأعمدة/الفهارس/السياسات مطابقة للإنتاج وقت التوليد.
-- ============================================================

-- ---------- الجداول + RLS ----------
create table if not exists public.autopilot (
  user_id uuid not null,
  enabled boolean default false not null,
  at_utc time without time zone default '04:15:00'::time without time zone not null,
  platforms text[] default '{youtube}'::text[] not null,
  template jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.autopilot enable row level security;

create table if not exists public.khatma_plans (
  plan_id text not null,
  plan jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.khatma_plans enable row level security;

create table if not exists public.khatma_progress (
  plan_id text not null,
  member text not null,
  done integer default 0 not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.khatma_progress enable row level security;

create table if not exists public.publish_queue (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  platform text not null,
  video_path text not null,
  video_name text default ''::text,
  title text default ''::text not null,
  caption text default ''::text not null,
  hashtags text default ''::text not null,
  status text default 'scheduled'::text not null,
  publish_at timestamp with time zone default now() not null,
  external_url text,
  error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.publish_queue enable row level security;

create table if not exists public.social_connections (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  platform text not null,
  account_id text default ''::text not null,
  account_name text default ''::text not null,
  meta jsonb default '{}'::jsonb not null,
  access_token text default ''::text not null,
  refresh_token text default ''::text not null,
  expires_at bigint,
  scopes text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.social_connections enable row level security;

-- ---------- الفهارس ----------
CREATE UNIQUE INDEX autopilot_pkey ON public.autopilot USING btree (user_id);
CREATE UNIQUE INDEX khatma_plans_pkey ON public.khatma_plans USING btree (plan_id);
CREATE UNIQUE INDEX khatma_progress_pkey ON public.khatma_progress USING btree (plan_id, member);
CREATE UNIQUE INDEX publish_queue_pkey ON public.publish_queue USING btree (id);
CREATE UNIQUE INDEX social_connections_pkey ON public.social_connections USING btree (id);
CREATE UNIQUE INDEX social_connections_user_id_platform_account_id_key ON public.social_connections USING btree (user_id, platform, account_id);

-- ---------- لا توجد مفاتيح خارجية ----------

-- ---------- السياسات (RLS) ----------
create policy "ap own" on public.autopilot for ALL to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "anon read plans" on public.khatma_plans for SELECT to public using (true);
create policy "anon update plans" on public.khatma_plans for UPDATE to public using (true) with check (true);
create policy "anon write plans" on public.khatma_plans for INSERT to public with check (true);
create policy "anon insert progress" on public.khatma_progress for INSERT to public with check (true);
create policy "anon read progress" on public.khatma_progress for SELECT to public using (true);
create policy "anon update progress" on public.khatma_progress for UPDATE to public using (true) with check (true);
create policy "pq own" on public.publish_queue for ALL to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "sc own" on public.social_connections for ALL to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "reels own delete" on storage.objects for DELETE to authenticated using (((bucket_id = 'reels'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "reels own insert" on storage.objects for INSERT to authenticated with check (((bucket_id = 'reels'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "reels own update" on storage.objects for UPDATE to authenticated using (((bucket_id = 'reels'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'reels'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy "reels public read" on storage.objects for SELECT to public using ((bucket_id = 'reels'::text));

-- ---------- الحاوية ----------
-- insert into storage.buckets (id, name, public) values ('reels', 'reels', true) on conflict (id) do nothing;
