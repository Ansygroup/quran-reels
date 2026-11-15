-- Disposable CI database only. Never apply to Supabase or any real project.
-- Extends the small PostgREST account fixture after its other tests have run.
alter table public.social_connections
  add column account_id text not null default '',
  add column account_name text not null default '',
  add column meta text not null default '',
  add column access_token text not null default '',
  add column refresh_token text not null default '',
  add column expires_at bigint,
  add column scopes text not null default '',
  add column is_default boolean not null default true,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
create unique index social_connections_fixture_identity on public.social_connections(user_id,platform,account_id);
grant update on public.social_connections to service_role;
notify pgrst, 'reload schema';
