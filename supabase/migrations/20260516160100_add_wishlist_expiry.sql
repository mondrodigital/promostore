-- =============================================================================
-- Workstream C — Issue #8: wishlist expiry & resolution path
-- =============================================================================
-- Today, wishlist_requests have no expiry. If inventory never returns or admin
-- forgets, requests sit forever. This migration adds expiry columns and a new
-- 'expired' status. The expire-wishlists edge function flips pending rows to
-- expired when they pass expires_at and emails the LO.
--
-- Existing status values: pending | fulfilled | added_to_order | cancelled.
-- We extend the CHECK to also allow 'expired'. No existing rows change status.
--
-- Backfill rules:
--   - expires_at gets created_at + 60 days for every existing row (so older
--     pending wishlists may immediately be eligible for expiry on the first
--     cron run — that's the desired behavior).
--   - expired_notified_at stays null on existing rows.
-- =============================================================================

ALTER TABLE wishlist_requests
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_notified_at timestamptz;

-- Backfill expires_at for existing rows that were created before this column existed.
UPDATE wishlist_requests
   SET expires_at = created_at + interval '60 days'
 WHERE expires_at IS NULL;

-- Default for new rows. Cannot reference created_at in a column default, so we
-- key off now() (created_at defaults to now() too, so they match within ms).
ALTER TABLE wishlist_requests
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '60 days'),
  ALTER COLUMN expires_at SET NOT NULL;

-- Replace the existing status CHECK with one that allows 'expired'.
-- Drops every CHECK constraint on wishlist_requests whose definition mentions
-- the status column so we don't end up with a stale and a new constraint
-- fighting each other if this migration is ever re-run on a partially-applied
-- schema.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  FOR v_constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'wishlist_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE wishlist_requests DROP CONSTRAINT %I', v_constraint_name);
  END LOOP;

  -- Idempotent: only add the constraint if it doesn't already exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'wishlist_requests'::regclass
      AND conname = 'wishlist_requests_status_check'
  ) THEN
    ALTER TABLE wishlist_requests
      ADD CONSTRAINT wishlist_requests_status_check
      CHECK (status IN ('pending', 'fulfilled', 'added_to_order', 'cancelled', 'expired'));
  END IF;
END$$;

-- Index used by the expire-wishlists edge function and the "expiring soon" UI badge.
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_expires_at
  ON wishlist_requests(expires_at)
  WHERE status = 'pending';

COMMENT ON COLUMN wishlist_requests.expires_at IS
  'When this wishlist request becomes eligible for automatic expiry. Defaults to now() + 60 days at insert time.';
COMMENT ON COLUMN wishlist_requests.expired_notified_at IS
  'Timestamp the LO was emailed about the expiry. Null = not yet notified (cron will pick it up).';

-- =============================================================================
-- pg_cron setup (commented — user runs this manually after deploying the
-- expire-wishlists edge function and confirming the function URL).
-- =============================================================================
--
-- Step 1 (one-time): enable pg_cron and pg_net in the Supabase SQL editor.
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- Step 2: schedule a daily 09:00 UTC invocation of the edge function.
-- Replace <PROJECT_REF> with your Supabase project ref and use the service
-- role key (NOT the anon key) so the function can update rows.
--
--   SELECT cron.schedule(
--     'expire-wishlists-daily',
--     '0 9 * * *',
--     $$
--       SELECT net.http_post(
--         url := 'https://<PROJECT_REF>.supabase.co/functions/v1/expire-wishlists',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
--         ),
--         body := '{}'::jsonb
--       );
--     $$
--   );
--
-- To unschedule:  SELECT cron.unschedule('expire-wishlists-daily');
-- To list jobs:   SELECT * FROM cron.job;
-- =============================================================================
