-- CANDIDATE ONLY for disposable local tests. Not a migration, not wired to the
-- application, and never apply to production without separate review/approval.
-- A volatile default on a populated table can rewrite/lock it. Existing active
-- workers do NOT know their new token and require a reviewed rollout strategy.
-- Ordinary writes invalidate a snapshot, but cannot force legacy callers to
-- compare tokens; privileged users may disable/change the trigger. Tokens do
-- not cancel or deduplicate provider calls. This is an alternative experiment
-- to candidate_publish_attempt_generation.sql, not a coordinated rollout.

alter table public.publish_queue
  add column queue_revision uuid not null default pg_catalog.gen_random_uuid();

create function public.publish_queue_revision_candidate()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- New value even for no-op updates and supplied revisions. Conservative:
  -- any competing update during publication makes finalization unconfirmed.
  new.queue_revision := pg_catalog.gen_random_uuid();
  return new;
end;
$$;

create trigger publish_queue_revision_candidate
  before insert or update on public.publish_queue
  for each row execute function public.publish_queue_revision_candidate();
