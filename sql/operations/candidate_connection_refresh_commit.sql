-- CANDIDATE ONLY: not a migration, not wired to any handler, not deployed.
-- The caller must send encrypted values in the request body, never plaintext.
-- An atomic compare-and-swap avoids writing credentials over an observed
-- changed row; it cannot prevent remote token rotation or unguarded later writes.
-- Own by a trusted non-login owner; grant execution only to a trusted service.
create or replace function public.connection_refresh_commit_candidate(
  p_user_id uuid, p_connection_id uuid, p_platform text, p_account_id text,
  p_expected_access text, p_expected_refresh text, p_expected_expires_at bigint,
  p_expected_updated_at timestamptz,
  p_new_access text, p_new_refresh text, p_new_expires_at bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_updated_id uuid;
begin
  -- Inputs are opaque ciphertext. A NULL new refresh token means leave the
  -- existing ciphertext intact; it does NOT mean the credential is valid.
  if p_user_id is null or p_connection_id is null or
     p_platform is null or p_platform not in ('youtube','x','tiktok') or
     p_account_id is null or length(p_account_id) = 0 or length(p_account_id) > 512 or
     p_expected_access is null or length(p_expected_access) = 0 or length(p_expected_access) > 16384 or
     p_expected_refresh is null or length(p_expected_refresh) = 0 or length(p_expected_refresh) > 16384 or
     p_expected_updated_at is null or
     p_new_access is null or length(p_new_access) = 0 or length(p_new_access) > 16384 or
     p_new_access = p_expected_access or
     (p_new_refresh is not null and (length(p_new_refresh) = 0 or length(p_new_refresh) > 16384)) or
     p_new_expires_at is null or p_new_expires_at <= 0 then
    return jsonb_build_object('outcome','invalid');
  end if;

  update public.social_connections c
     set access_token = p_new_access,
         refresh_token = case when p_new_refresh is null then c.refresh_token else p_new_refresh end,
         expires_at = p_new_expires_at,
         updated_at = pg_catalog.clock_timestamp()
   where c.id = p_connection_id and c.user_id = p_user_id
     and c.platform = p_platform and c.account_id = p_account_id
     and c.access_token = p_expected_access and c.refresh_token = p_expected_refresh
     and c.expires_at is not distinct from p_expected_expires_at
     and c.updated_at = p_expected_updated_at
   returning c.id into v_updated_id;

  -- Do not reveal whether the row was absent, another owner's, or changed.
  if v_updated_id is null then return jsonb_build_object('outcome','conflict'); end if;
  return jsonb_build_object('outcome','updated');
end;
$$;
revoke all on function public.connection_refresh_commit_candidate(uuid,uuid,text,text,text,text,bigint,timestamptz,text,text,bigint) from public, anon, authenticated;
grant execute on function public.connection_refresh_commit_candidate(uuid,uuid,text,text,text,text,bigint,timestamptz,text,text,bigint) to service_role;
