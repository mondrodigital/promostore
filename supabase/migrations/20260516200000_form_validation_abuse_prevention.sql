-- =============================================================================
-- Workstream B: Form validation & abuse prevention
-- =============================================================================
-- Covers issues:
--   #6  – Cross-validation of event dates vs pickup/return dates
--   #11 – Maximum checkout duration (pickup-to-return window)
--   #16 – Idempotency key to prevent duplicate order creation
--
-- Depends on Workstream A's migration:
--   20260516000000_date_aware_availability.sql
-- which rewrote create_order_with_checkouts with the JSONB response contract
-- and date-range availability helpers. This migration replaces that function
-- again, preserving all A-introduced behaviour and layering B on top.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0) app_config table — future home of admin-configurable constants
-- ---------------------------------------------------------------------------
-- Right now max_checkout_days is also hardcoded as MAX_CHECKOUT_DAYS = 14 in
-- src/components/BottomRequestBar.tsx. When an admin UI is added, the front-end
-- should read from this table instead of the constant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_config (
  key         text PRIMARY KEY,
  value       text        NOT NULL,
  description text
);

INSERT INTO app_config (key, value, description)
VALUES (
  'max_checkout_days',
  '14',
  'Maximum days between pickup (checkout_date) and return (return_date). '
  'Enforced by CHECK constraint chk_max_checkout_duration on orders and '
  'mirrored as MAX_CHECKOUT_DAYS in src/components/BottomRequestBar.tsx.'
)
ON CONFLICT (key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 1) Idempotency key column on orders (#16)
-- ---------------------------------------------------------------------------
-- uuid type; nullable so legacy rows and wishlist-only paths are unaffected.
-- Uniqueness is enforced via a partial index (NULLs are excluded).
-- ---------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

-- Partial unique index: only non-NULL keys must be unique.
-- This allows multiple orders without a key (e.g. older code paths) while
-- still guaranteeing that two submissions with the same key map to one order.
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uidx
  ON orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 2) CHECK constraints for date cross-validation (#6) and duration (#11)
-- ---------------------------------------------------------------------------

-- #6a: Pickup date must be on or before event start date (when both are set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_pickup_before_event_start'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT chk_pickup_before_event_start
      CHECK (
        event_start_date IS NULL
        OR checkout_date  IS NULL
        OR checkout_date <= event_start_date
      );
  END IF;
END;
$$;

-- #6b: Return date must be on or after event end date (when both are set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_return_after_event_end'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT chk_return_after_event_end
      CHECK (
        event_end_date IS NULL
        OR return_date IS NULL
        OR return_date >= event_end_date
      );
  END IF;
END;
$$;

-- #11: Maximum checkout window — pickup-to-return must not exceed 14 days.
-- The literal 14 must stay in sync with app_config.max_checkout_days and
-- MAX_CHECKOUT_DAYS in BottomRequestBar.tsx.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_max_checkout_duration'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT chk_max_checkout_duration
      CHECK (
        checkout_date IS NULL
        OR return_date IS NULL
        OR (return_date - checkout_date) <= 14
      );
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3) Rewrite create_order_with_checkouts — adds idempotency + date validation
-- ---------------------------------------------------------------------------
-- Preserves all behaviour introduced by Workstream A:
--   * JSONB response contract (success/failure payloads)
--   * Race-safe row locking (SELECT … FOR UPDATE sorted by id ASC)
--   * Date-range availability via get_available_quantity()
--   * Structured INSUFFICIENT_STOCK conflict response (not RAISE)
--
-- New in Workstream B:
--   * p_idempotency_key (uuid, optional): idempotent replay guard (#16)
--   * Server-side validation: pickup ≤ event start, return ≥ event end (#6)
--   * Server-side validation: return - checkout ≤ 14 days (#11)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, text, text, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, text, text, text, text, text, jsonb, text, uuid);

CREATE OR REPLACE FUNCTION create_order_with_checkouts(
  p_user_name        text,
  p_user_email       text,
  p_checkout_date    text,
  p_return_date      text,
  p_event_start_date text    DEFAULT NULL,
  p_event_end_date   text    DEFAULT NULL,
  p_items            jsonb   DEFAULT '[]'::jsonb,
  p_status           text    DEFAULT 'pending',
  p_idempotency_key  uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id      uuid;
  v_order_number  text;
  v_checkout_date date;
  v_return_date   date;
  v_event_start   date;
  v_event_end     date;
  v_item_ids      uuid[];
  v_locked        record;
  v_req           record;
  v_available     integer;
  v_conflicts     jsonb := '[]'::jsonb;
  v_existing      record;
BEGIN

  -- -------------------------------------------------------------------------
  -- Idempotency guard (#16)
  -- -------------------------------------------------------------------------
  -- If a key was supplied and an order already carries it, return that order
  -- immediately. This handles browser retries, double-submits that bypass the
  -- UI guard, and any client-side retry logic without creating duplicates.
  -- -------------------------------------------------------------------------
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, order_number
    INTO   v_existing
    FROM   orders
    WHERE  idempotency_key = p_idempotency_key
    LIMIT  1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success',      true,
        'order_id',     v_existing.id,
        'order_number', COALESCE(v_existing.order_number, ''),
        'message',      'Existing order returned (idempotent replay)'
      );
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- Input validation
  -- -------------------------------------------------------------------------
  IF p_user_name IS NULL OR p_user_name = '' THEN
    RAISE EXCEPTION 'User name is required';
  END IF;

  IF p_user_email IS NULL OR p_user_email = '' THEN
    RAISE EXCEPTION 'User email is required';
  END IF;

  IF NOT validate_email(p_user_email) THEN
    RAISE EXCEPTION 'Invalid email format. Please enter a valid email address.';
  END IF;

  -- Parse pickup / return dates
  BEGIN
    v_checkout_date := p_checkout_date::date;
    v_return_date   := p_return_date::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid date format. Expected YYYY-MM-DD';
  END;

  IF v_return_date < v_checkout_date THEN
    RAISE EXCEPTION 'Return date must be on or after checkout date';
  END IF;

  -- #11: Maximum checkout duration
  IF (v_return_date - v_checkout_date) > 14 THEN
    RAISE EXCEPTION
      'Checkout window of % days exceeds the maximum of 14 days (pickup to return)',
      (v_return_date - v_checkout_date);
  END IF;

  -- Parse optional event dates
  IF p_event_start_date IS NOT NULL AND p_event_start_date <> '' THEN
    BEGIN
      v_event_start := p_event_start_date::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid event start date format. Expected YYYY-MM-DD';
    END;
  END IF;

  IF p_event_end_date IS NOT NULL AND p_event_end_date <> '' THEN
    BEGIN
      v_event_end := p_event_end_date::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid event end date format. Expected YYYY-MM-DD';
    END;
  END IF;

  -- #6: Cross-validate pickup vs event start
  IF v_event_start IS NOT NULL AND v_checkout_date > v_event_start THEN
    RAISE EXCEPTION
      'Pickup date (%) must be on or before the event start date (%)',
      v_checkout_date, v_event_start;
  END IF;

  -- #6: Cross-validate return vs event end
  IF v_event_end IS NOT NULL AND v_return_date < v_event_end THEN
    RAISE EXCEPTION
      'Return date (%) must be on or after the event end date (%)',
      v_return_date, v_event_end;
  END IF;

  -- Non-wishlist orders require at least one item
  IF p_status = 'pending'
     AND (p_items IS NULL
          OR p_items = '[]'::jsonb
          OR jsonb_array_length(p_items) = 0) THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- -------------------------------------------------------------------------
  -- Race-safe availability check (Workstream A approach, preserved)
  -- -------------------------------------------------------------------------
  IF p_items IS NOT NULL
     AND p_items <> '[]'::jsonb
     AND jsonb_array_length(p_items) > 0 THEN

    -- Collect item ids and lock in ascending order to prevent deadlocks
    SELECT array_agg(DISTINCT (i->>'item_id')::uuid ORDER BY (i->>'item_id')::uuid)
    INTO   v_item_ids
    FROM   jsonb_array_elements(p_items) AS i;

    PERFORM 1
    FROM   promo_items
    WHERE  id = ANY(v_item_ids)
    ORDER BY id ASC
    FOR UPDATE;

    -- Check date-range availability for each requested item
    FOR v_req IN
      SELECT (i->>'item_id')::uuid AS item_id,
             (i->>'quantity')::int  AS quantity
      FROM   jsonb_array_elements(p_items) AS i
    LOOP
      IF v_req.quantity IS NULL OR v_req.quantity <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for item %', v_req.quantity, v_req.item_id;
      END IF;

      SELECT id, name, total_quantity
      INTO   v_locked
      FROM   promo_items
      WHERE  id = v_req.item_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item with ID % not found', v_req.item_id;
      END IF;

      v_available := get_available_quantity(v_req.item_id, v_checkout_date, v_return_date);

      IF v_req.quantity > v_available THEN
        v_conflicts := v_conflicts || jsonb_build_object(
          'item_id',   v_locked.id,
          'item_name', v_locked.name,
          'requested', v_req.quantity,
          'available', v_available
        );
      END IF;
    END LOOP;

    IF jsonb_array_length(v_conflicts) > 0 THEN
      RETURN jsonb_build_object(
        'success',   false,
        'code',      'INSUFFICIENT_STOCK',
        'message',   'One or more items are no longer available for the chosen dates',
        'conflicts', v_conflicts
      );
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- Create the order
  -- -------------------------------------------------------------------------
  INSERT INTO orders (
    user_name,
    user_email,
    checkout_date,
    return_date,
    event_start_date,
    event_end_date,
    status,
    idempotency_key
  ) VALUES (
    p_user_name,
    p_user_email,
    v_checkout_date,
    v_return_date,
    v_event_start,
    v_event_end,
    p_status::order_status,
    p_idempotency_key
  ) RETURNING id INTO v_order_id;

  SELECT order_number INTO v_order_number
  FROM   orders WHERE id = v_order_id;

  -- Create checkouts and maintain legacy available_quantity snapshot
  IF p_items IS NOT NULL
     AND p_items <> '[]'::jsonb
     AND jsonb_array_length(p_items) > 0 THEN

    FOR v_req IN
      SELECT (i->>'item_id')::uuid AS item_id,
             (i->>'quantity')::int  AS quantity
      FROM   jsonb_array_elements(p_items) AS i
    LOOP
      INSERT INTO checkouts (order_id, item_id, quantity)
      VALUES (v_order_id, v_req.item_id, v_req.quantity);

      -- Keep denormalized snapshot for legacy readers (see Workstream A notes)
      UPDATE promo_items
      SET    available_quantity = GREATEST(available_quantity - v_req.quantity, 0),
             updated_at         = now()
      WHERE  id = v_req.item_id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success',      true,
    'order_id',     v_order_id,
    'order_number', COALESCE(v_order_number, ''),
    'message',      'Order created successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_with_checkouts(text, text, text, text, text, text, jsonb, text, uuid)
  TO anon, authenticated;
