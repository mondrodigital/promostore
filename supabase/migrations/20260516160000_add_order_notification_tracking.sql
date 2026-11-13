-- =============================================================================
-- Workstream C — Issue #7: track Power Automate webhook delivery status
-- =============================================================================
-- Today, when the Power Automate webhook fails, the order succeeds but admins
-- are never told. This migration adds columns the edge function uses to record
-- each delivery attempt, plus an index so the admin dashboard can quickly find
-- orders that need attention.
--
-- Backfill rule: existing rows keep notification_status = 'pending' so an
-- admin can manually retry historical orders if desired. They will not be
-- counted as "failed" until they are retried and exhaust attempts.
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS notification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notification_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_last_error text,
  ADD COLUMN IF NOT EXISTS notification_last_attempt_at timestamptz;

-- Constrain notification_status to the values the edge function uses.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_notification_status_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_notification_status_check
      CHECK (notification_status IN ('pending', 'sent', 'failed', 'retrying'));
  END IF;
END$$;

-- Index so the admin UI can filter "Notification issues" cheaply.
CREATE INDEX IF NOT EXISTS idx_orders_notification_status
  ON orders(notification_status)
  WHERE notification_status IN ('failed', 'retrying');

COMMENT ON COLUMN orders.notification_status IS
  'Power Automate webhook delivery state. One of pending|sent|failed|retrying. Updated by send-power-automate-webhook and retry-order-notification edge functions.';
COMMENT ON COLUMN orders.notification_attempts IS
  'Number of webhook delivery attempts made so far (including retries).';
COMMENT ON COLUMN orders.notification_last_error IS
  'Most recent webhook failure message (null when notification_status = sent).';
COMMENT ON COLUMN orders.notification_last_attempt_at IS
  'Timestamp of the most recent webhook attempt (success or failure).';
