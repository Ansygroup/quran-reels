-- Per-user daily video count, explicit YouTube channel selection, and progress metadata.
-- Existing automation remains enabled/disabled as-is; count defaults to one and an empty
-- channel list means all channels currently linked to that user's account.
alter table public.autopilot
  add column if not exists daily_count smallint not null default 1,
  add column if not exists youtube_connection_ids uuid[] not null default '{}'::uuid[];

alter table public.autopilot_runs
  add column if not exists daily_index smallint not null default 1,
  add column if not exists daily_total smallint not null default 1,
  add column if not exists youtube_connection_id uuid,
  add column if not exists channel_name text not null default '',
  add column if not exists step text not null default 'rendering';

alter table public.publish_queue
  add column if not exists social_connection_id uuid;

update public.autopilot_runs
set step = case
  when status = 'published' then 'published'
  when status = 'queued' then 'publishing'
  when status = 'failed' then 'preparing'
  else 'rendering'
end;

create index if not exists autopilot_runs_user_date_idx
  on public.autopilot_runs (user_id, run_date desc, daily_index);
create index if not exists publish_queue_social_connection_id_idx
  on public.publish_queue (social_connection_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'autopilot_daily_count_check') then
    alter table public.autopilot add constraint autopilot_daily_count_check check (daily_count between 1 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'autopilot_runs_daily_index_check') then
    alter table public.autopilot_runs add constraint autopilot_runs_daily_index_check check (daily_index between 1 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'autopilot_runs_daily_total_check') then
    alter table public.autopilot_runs add constraint autopilot_runs_daily_total_check check (daily_total between 1 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'autopilot_runs_step_check') then
    alter table public.autopilot_runs add constraint autopilot_runs_step_check
      check (step = any (array['preparing','rendering','storing','publishing','published','failed']::text[]));
  end if;
end $$;
