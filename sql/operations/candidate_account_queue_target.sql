-- CANDIDATE ONLY. Isolated experimentation; not applied or wired to app.
-- Requires candidate_account_default.sql and the real schema's connection FK.
-- This intentionally changes legacy behavior and can prevent disconnecting
-- any channel referenced by a queue row, including old published rows. Existing
-- queue helper ensureQueueRow searches by NULL connection_id for default jobs;
-- it is currently test-only, but would be unsafe if reused with this trigger.
-- Other actual queue/retry deduplication paths also require review. A real
-- rollout needs verified deduplication, an approved retention/revocation
-- strategy, a legacy audit and protection against uncoordinated writers.
create or replace function public.account_queue_target_candidate()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if tg_op='UPDATE' then
    -- Never let ON DELETE SET NULL or direct owner/platform changes silently
    -- retarget a row, including legacy rows whose target was already lost.
    if new.user_id is distinct from old.user_id or new.platform is distinct from old.platform or
       (old.connection_id is not null and new.connection_id is distinct from old.connection_id) then
      raise exception 'queue target is immutable';
    end if;
    -- Existing NULL rows cannot be safely inferred: they may have lost a target.
    if old.connection_id is null and (new.connection_id is not null or
        new.status is null or new.status not in ('published','cancelled')) then
      raise exception 'legacy queue target requires review';
    end if;
    return new;
  end if;
  if new.user_id is null or new.platform is null then raise exception 'queue target is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text || ':' || new.platform,0));
  if new.connection_id is null then
    -- No fallback to latest: an ambiguous/missing default requires review.
    select c.id into v_id from public.social_connections c
      where c.user_id=new.user_id and c.platform=new.platform and c.is_default is true
      for key share;
    if not found then raise exception 'default queue target not found'; end if;
    new.connection_id:=v_id;
  else
    select c.id into v_id from public.social_connections c
      where c.id=new.connection_id and c.user_id=new.user_id and c.platform=new.platform
      for key share;
    if not found then raise exception 'queue target not found'; end if;
  end if;
  return new;
end $$;
revoke all on function public.account_queue_target_candidate() from public, anon, authenticated, service_role;
create trigger account_queue_target_candidate_insert before insert on public.publish_queue
for each row execute function public.account_queue_target_candidate();
create trigger account_queue_target_candidate_update before update of connection_id, status, user_id, platform on public.publish_queue
for each row execute function public.account_queue_target_candidate();
