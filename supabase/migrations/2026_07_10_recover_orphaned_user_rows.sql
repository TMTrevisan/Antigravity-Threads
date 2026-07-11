-- ════════════════════════════════════════════════════════════════════════════
-- One-time recovery migration: reassigns orphaned rows (user_id = NULL) to
-- a specific user by email.
--
-- Why this exists:
--   Before commit f47d8b8 (auth + user_id on every insert), the API routes
--   used Supabase's admin client which bypasses RLS. Inserts fell through to
--   the `user_id DEFAULT auth.uid()` default, but with the admin client
--   auth.uid() returns NULL. The result: every row created before that commit
--   has user_id = NULL.
--
--   After f47d8b8, all routes use the JWT-scoped client, and RLS hides rows
--   where user_id ≠ auth.uid() — which means all of those NULL rows are
--   invisible to every user.
--
-- Run this once per user that lost access. It is idempotent: re-running
-- after the rows are already owned will simply skip them (the WHERE clause
-- requires user_id IS NULL).
-- ════════════════════════════════════════════════════════════════════════════

-- Set the target user once (change the email if you need a different user).
WITH target AS (
  SELECT id AS uid FROM auth.users WHERE email = 'mrtoddles11@gmail.com' LIMIT 1
)

UPDATE public.garments AS g
  SET user_id = t.uid
  FROM target t
  WHERE g.user_id IS NULL;

UPDATE public.wear_logs AS w
  SET user_id = t.uid
  FROM target t
  WHERE w.user_id IS NULL;

UPDATE public.saved_outfits AS s
  SET user_id = t.uid
  FROM target t
  WHERE s.user_id IS NULL;

UPDATE public.user_measurements AS m
  SET user_id = t.uid
  FROM target t
  WHERE m.user_id IS NULL;