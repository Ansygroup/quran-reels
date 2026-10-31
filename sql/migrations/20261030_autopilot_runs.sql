-- Private execution history for the account autopilot dashboard.
create table if not exists public.autopilot_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  run_key text not null unique,
  run_type text not null check (run_type in ('daily', 'manual')),
  run_date date not null,
  status text not null default 'rendering' check (status in ('rendering', 'queued', 'published', 'failed')),
  recipe_key text,
  reciter text,
  title text,
  video_path text,
  publish_queue_id uuid,
  external_url text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists autopilot_runs_user_created_idx on public.autopilot_runs (user_id, created_at desc);
alter table public.autopilot_runs enable row level security;
grant select on public.autopilot_runs to authenticated;
drop policy if exists "autopilot runs own read" on public.autopilot_runs;
create policy "autopilot runs own read" on public.autopilot_runs for select to authenticated using (user_id = auth.uid());
