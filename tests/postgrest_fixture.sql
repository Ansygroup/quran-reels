-- ISOLATED CI FIXTURE ONLY. Never apply this file to a real project.
-- The DB is a newly-created local GitHub Actions service container.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit password 'local-fixture-only';
grant anon, authenticated, service_role to authenticator;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table public.autopilot (
  user_id uuid primary key references auth.users(id), enabled boolean not null default false,
  at_utc time not null default '04:15', platforms text[] not null default '{youtube}',
  template jsonb not null default '{}', all_channels boolean not null default false,
  updated_at timestamptz not null default now(), daily_count smallint not null default 1,
  youtube_connection_ids uuid[] not null default '{}'
);
alter table public.autopilot enable row level security;
create policy "ap own" on public.autopilot for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());
grant select,insert,update,delete,truncate,references,trigger,maintain on public.autopilot to authenticated,service_role;
-- Deliberately grant column privileges separately to test that revocation covers them.
grant update(template),insert(enabled) on public.autopilot to authenticated;
-- Minimal connected-platform fixture for the real API handler; no tokens.
create table public.social_connections(id uuid primary key default gen_random_uuid(),user_id uuid not null, platform text not null);
insert into public.social_connections(user_id,platform)
values ('44444444-4444-4444-8444-444444444444','youtube');
grant select,insert,delete on public.social_connections to service_role;
-- Minimal temporary run ledger for HTTP transition/lost-reply tests.
create table public.autopilot_runs(id uuid primary key,user_id uuid not null references auth.users(id),status text not null,video_path text,external_url text,error text,completed_at timestamptz,updated_at timestamptz not null default now());
grant select,insert,update,delete on public.autopilot_runs to service_role;
create table public.publish_queue(id uuid primary key,user_id uuid not null references auth.users(id),platform text not null,connection_id uuid,video_path text not null,video_name text,title text,caption text,hashtags text,status text not null,publish_at timestamptz);
grant select,insert,update,delete on public.publish_queue to service_role;
