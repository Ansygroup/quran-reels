-- CANDIDATE ONLY: local disposable tests; DO NOT APPLY TO PRODUCTION.
-- This removes all direct API table access for anon/authenticated, not just
-- writes. It can break older clients, integrations and direct Supabase queries.
-- New account APIs must be deployed first; audit all clients, role inheritance,
-- column grants, provider callbacks, and a rehearsed rollback before rollout.
-- Service role access is intentionally unchanged and remains highly privileged.
begin;
revoke select, insert, update, delete, truncate, references, trigger, maintain
  on public.social_connections, public.publish_queue from public, anon, authenticated;
do $$
declare tab regclass; cols text; r text; p text;
begin
  foreach tab in array array['public.social_connections'::regclass,'public.publish_queue'::regclass] loop
    select pg_catalog.string_agg(pg_catalog.quote_ident(attname), ', ' order by attnum) into cols
      from pg_catalog.pg_attribute where attrelid=tab and attnum>0 and not attisdropped;
    if cols is not null then
      execute pg_catalog.format('revoke select (%s), insert (%s), update (%s), references (%s) on table %s from public, anon, authenticated',cols,cols,cols,cols,tab);
    end if;
    foreach r in array array['anon','authenticated'] loop
      foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        if pg_catalog.has_table_privilege(r,tab,p) then raise exception 'role % retains % on %',r,p,tab; end if;
      end loop;
      foreach p in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
        if pg_catalog.has_any_column_privilege(r,tab,p) then raise exception 'role % retains column % on %',r,p,tab; end if;
      end loop;
    end loop;
  end loop;
end $$;
commit;
