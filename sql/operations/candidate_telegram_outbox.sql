-- Candidate only: DO NOT apply to production. Requires separately reviewed
-- schema, privileges, worker integration and end-to-end PostgREST tests.
-- Service is responsible for authenticating p_user_id; this is not a client API.
BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_delivery_candidate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  destination_id text NOT NULL,
  video_path text NOT NULL,
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','sending','sent','rejected','uncertain')),
  message_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,destination_id,video_path),
  CHECK (length(destination_id) BETWEEN 1 AND 32),
  CHECK (length(video_path) BETWEEN 1 AND 500),
  CHECK ((state = 'sent') = (message_id IS NOT NULL))
);
ALTER TABLE public.telegram_delivery_candidate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_delivery_candidate FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.telegram_prepare_candidate(p_user_id uuid, p_connection_id uuid, p_video_path text)
RETURNS TABLE (id uuid, state text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_dest text;
BEGIN
  IF p_user_id IS NULL OR p_connection_id IS NULL OR p_video_path IS NULL
    OR length(p_video_path)>500 OR left(p_video_path,length(p_user_id::text)+1) <> p_user_id::text || '/'
    OR p_video_path ~ '(^|/)\.\.(/|$)' THEN RAISE EXCEPTION 'invalid delivery'; END IF;
  SELECT c.account_id INTO v_dest FROM public.social_connections c
    WHERE c.id=p_connection_id AND c.user_id=p_user_id AND c.platform='telegram';
  IF v_dest IS NULL OR v_dest !~ '^-?[1-9][0-9]{0,19}$' THEN RAISE EXCEPTION 'destination unavailable'; END IF;
  INSERT INTO public.telegram_delivery_candidate AS d (user_id,connection_id,destination_id,video_path)
    VALUES (p_user_id,p_connection_id,v_dest,p_video_path)
    ON CONFLICT (user_id,destination_id,video_path) DO NOTHING;
  RETURN QUERY SELECT d.id,d.state FROM public.telegram_delivery_candidate d
    WHERE d.user_id=p_user_id AND d.destination_id=v_dest AND d.video_path=p_video_path;
END $$;

CREATE OR REPLACE FUNCTION public.telegram_claim_candidate(p_user_id uuid, p_id uuid)
RETURNS TABLE (id uuid, connection_id uuid, destination_id text, video_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN QUERY UPDATE public.telegram_delivery_candidate d SET state='sending',updated_at=now()
    WHERE d.id=p_id AND d.user_id=p_user_id AND d.state='ready'
      AND EXISTS (SELECT 1 FROM public.social_connections c WHERE c.id=d.connection_id AND c.user_id=d.user_id AND c.platform='telegram' AND c.account_id=d.destination_id)
    RETURNING d.id,d.connection_id,d.destination_id,d.video_path;
END $$;

CREATE OR REPLACE FUNCTION public.telegram_finish_candidate(p_user_id uuid, p_id uuid, p_state text, p_message_id bigint DEFAULT NULL)
RETURNS TABLE (id uuid, state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_state NOT IN ('sent','rejected','uncertain') OR (p_state='sent' AND (p_message_id IS NULL OR p_message_id <= 0)) OR (p_state<>'sent' AND p_message_id IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid result';
  END IF;
  RETURN QUERY UPDATE public.telegram_delivery_candidate d SET state=p_state,message_id=p_message_id,updated_at=now()
    WHERE d.id=p_id AND d.user_id=p_user_id AND d.state='sending'
    RETURNING d.id,d.state;
END $$;

REVOKE ALL ON FUNCTION public.telegram_prepare_candidate(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_claim_candidate(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_finish_candidate(uuid,uuid,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_prepare_candidate(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_claim_candidate(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_finish_candidate(uuid,uuid,text,bigint) TO service_role;
COMMIT;
