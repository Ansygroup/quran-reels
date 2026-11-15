-- CANDIDATE ONLY: disposable local experiments. Not an application migration,
-- not wired to the publisher, and never apply to production without review.
-- Cooperating claim/finalize code must compare this generation in its WHERE.
-- Legacy finalizers that ignore it can still overwrite a newer attempt, and
-- no database token can cancel a request already sent to an external provider.
-- Existing rows already publishing remain NULL and need manual review.
-- Review permissions, backfill, other triggers, old writers and rollout first.

alter table public.publish_queue
  add column if not exists publish_attempt_id uuid;

create or replace function public.publish_attempt_generation_candidate()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'publishing' then
    if tg_op = 'INSERT' then
      new.publish_attempt_id := pg_catalog.gen_random_uuid();
    elsif old.status is distinct from 'publishing' then
      new.publish_attempt_id := pg_catalog.gen_random_uuid();
    else
      -- A writer cannot replace the generation while the same claim is active.
      new.publish_attempt_id := old.publish_attempt_id;
    end if;
  else
    new.publish_attempt_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists publish_attempt_generation_candidate on public.publish_queue;
create trigger publish_attempt_generation_candidate
  before insert or update of status, publish_attempt_id on public.publish_queue
  for each row execute function public.publish_attempt_generation_candidate();
