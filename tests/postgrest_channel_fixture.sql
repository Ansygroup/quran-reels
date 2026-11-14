-- THROWAWAY CI fixture only; do not apply to any real project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit password 'fixture-only';
grant anon,authenticated,service_role to authenticator;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid$$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table public.social_connections(id uuid primary key,user_id uuid not null,platform text not null,is_default boolean not null default false,access_token text not null default 'fixture-ciphertext');
create unique index one_default on public.social_connections(user_id,platform) where is_default;
create table public.publish_queue(id uuid primary key,user_id uuid not null,platform text not null,connection_id uuid references public.social_connections(id) on delete set null,status text not null,updated_at timestamptz not null default now(),error text,video_path text);
alter table public.social_connections enable row level security;
alter table public.publish_queue enable row level security;
create policy sc_own on public.social_connections for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy pq_own on public.publish_queue for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update,delete,truncate,references,trigger,maintain on public.social_connections,public.publish_queue to authenticated,service_role;
grant select(access_token),update(platform) on public.social_connections to authenticated;
insert into public.social_connections(id,user_id,platform,is_default) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','youtube',true),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','youtube',false),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','youtube',true);
