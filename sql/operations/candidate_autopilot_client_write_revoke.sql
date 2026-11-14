-- CANDIDATE ONLY: not an automatic migration and NOT yet approved for production.
-- Apply only after the guarded API is live, legacy writers are addressed, a
-- compatibility window is agreed, and the whole plan is tested in isolation.
-- Service-role writes and old service deployments are NOT constrained here.
-- Preserve SELECT/RLS and all existing rows and images.
begin;
revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.autopilot from public, anon, authenticated;

-- Table-level REVOKE does not remove separately granted column privileges.
do $$
declare cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_catalog.pg_attribute
    where attrelid = 'public.autopilot'::regclass and attnum > 0 and not attisdropped;
  if cols is not null then
    execute format('revoke insert (%s), update (%s), references (%s) on table public.autopilot from public, anon, authenticated', cols, cols, cols);
  end if;
end $$;

-- Refuse a false sense of protection if a role inherits a grant from elsewhere.
do $$
declare r text; p text;
begin
  foreach r in array array['anon','authenticated'] loop
    foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
      if has_table_privilege(r, 'public.autopilot', p) then
        raise exception 'role % retains table privilege %', r, p;
      end if;
    end loop;
    foreach p in array array['INSERT','UPDATE','REFERENCES'] loop
      if has_any_column_privilege(r, 'public.autopilot', p) then
        raise exception 'role % retains column privilege %', r, p;
      end if;
    end loop;
  end loop;
end $$;
commit;
