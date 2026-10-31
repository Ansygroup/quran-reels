-- Public contact submissions must use the validating/rate-limited SECURITY DEFINER RPC.
-- Direct table inserts bypass its validation and per-email daily limit.
DROP POLICY IF EXISTS contact_insert_q ON public.contact_messages;
