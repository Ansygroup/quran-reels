-- Firebase Auth users are mapped to a stable uuid v5 in lib/sess.js, so they have no row in auth.users.
-- Only this table had a foreign key to auth.users; drop it so private backgrounds can be saved for them.
alter table if exists public.private_autopilot_backgrounds
  drop constraint if exists private_autopilot_backgrounds_user_id_fkey;
