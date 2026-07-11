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

-- 1. Find the target user's UUID from their email.
DO $$
DECLARE
  target_user_id UUID;
  target_email TEXT := 'mrtoddles11@gmail.com'; -- ← change this if needed
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row found for email %', target_email;
  END IF;

  RAISE NOTICE 'Reassigning orphaned rows to user % (%)', target_email, target_user_id;

  -- 2. Reassign core tables. Each statement is independent — if one table
  --    is missing in your environment, only its statement will error and
  --    the rest still run.

  UPDATE public.garments
    SET user_id = target_user_id
    WHERE user_id IS NULL;
  RAISE NOTICE '  garments: % rows updated', (SELECT COUNT(*) FROM public.garments WHERE user_id = target_user_id);

  -- garment_images has no user_id column; rows belong to a garment, which
  -- now carries user_id via the FK. Nothing to update here.

  UPDATE public.wear_logs
    SET user_id = target_user_id
    WHERE user_id IS NULL;
  RAISE NOTICE '  wear_logs: % rows updated', (SELECT COUNT(*) FROM public.wear_logs WHERE user_id = target_user_id);

  UPDATE public.saved_outfits
    SET user_id = target_user_id
    WHERE user_id IS NULL;
  RAISE NOTICE '  saved_outfits: % rows updated', (SELECT COUNT(*) FROM public.saved_outfits WHERE user_id = target_user_id);

  UPDATE public.user_measurements
    SET user_id = target_user_id
    WHERE user_id IS NULL;
  RAISE NOTICE '  user_measurements: % rows updated', (SELECT COUNT(*) FROM public.user_measurements WHERE user_id = target_user_id);

  -- billing_and_token_ledger: same pattern
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_and_token_ledger') THEN
    UPDATE public.billing_and_token_ledger
      SET user_id = target_user_id
      WHERE user_id IS NULL;
    RAISE NOTICE '  billing_and_token_ledger: rows updated';
  END IF;

  -- weather_cache has no user_id; rows are keyed by geohash. Skip.

  RAISE NOTICE 'Done. Reload the app and your clothes should be visible.';
END $$;