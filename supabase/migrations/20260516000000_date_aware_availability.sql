-- =============================================================================
-- Workstream A: Date-aware inventory availability + race-safe order creation
-- =============================================================================
--
-- Background
-- ----------
-- Historically, `promo_items.available_quantity` was a single static counter that
-- was decremented on order creation and incremented on return/cancel. That model
-- conflated time: two LOs with non-overlapping events could falsely block each
-- other, because a request from October would still be holding down the counter
-- when somebody else tried to book the same item for December.
--
-- This migration introduces date-range availability:
--   * `get_available_quantity(item, start, end)` - point-in-time available count
--     for an item over a date range, computed from active checkouts.
--   * `get_available_quantities_bulk(items[], start, end)` - same but for many
--     items at once (cart-time / inventory-page bulk lookup).
--   * `get_item_conflicts(item, start, end)` - aggregated reservation date ranges
--     and quantities that overlap the requested window, with NO PII (no user
--     name, email, or order id leaked). Powers issues #18 (why-unavailable
--     tooltip) and #9 (cart-time overlap heads-up).
--
-- Also rewrites `create_order_with_checkouts` so that:
--   * It recomputes availability per item INSIDE the transaction using the new
--     date-range function (issue #14, race condition).
--   * It locks `promo_items` rows via `SELECT ... FOR UPDATE`, sorting by id
--     ascending to prevent deadlocks under concurrent inserts.
--   * On insufficient stock it RETURNS a structured `success=false` jsonb
--     payload (rather than raising), so the client (`orderService.ts`) can
--     surface a specific per-item conflict message (#17). RAISE is reserved for
--     genuinely unrecoverable errors (validation, missing user input, etc).
--
-- Decision on `promo_items.available_quantity`
-- --------------------------------------------
-- We KEEP the column as a denormalized "live" snapshot (updated by the RPC and
-- by status transitions in `update_order_status`). This avoids breaking any
-- legacy reads (older edge functions, admin tooling, the InventoryTable that
-- still shows it). All NEW user-facing availability decisions are driven off
-- `get_available_quantity*` instead. Once we confirm no remaining readers, we
-- can drop the column in a follow-up migration.
--
-- Status semantics
-- ----------------
-- The current `order_status` enum is: pending, picked_up, returned, cancelled,
-- wishlist_only. An order CONSUMES inventory for its [checkout_date, return_date]
-- window when its status is NOT in (returned, cancelled, wishlist_only).
-- (wishlist_only orders have no `checkouts` rows anyway, but we filter on status
-- as a belt-and-suspenders measure.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Single-item date-aware availability
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_available_quantity(
  p_item_id uuid,
  p_start   date,
  p_end     date
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total       integer;
  v_committed   integer;
BEGIN
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'get_available_quantity: p_item_id is required';
  END IF;

  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'get_available_quantity: p_start and p_end are required';
  END IF;

  IF p_end < p_start THEN
    RAISE EXCEPTION 'get_available_quantity: p_end (%) must be >= p_start (%)', p_end, p_start;
  END IF;

  SELECT total_quantity
  INTO v_total
  FROM promo_items
  WHERE id = p_item_id;

  IF v_total IS NULL THEN
    RAISE EXCEPTION 'get_available_quantity: item % not found', p_item_id;
  END IF;

  SELECT COALESCE(SUM(c.quantity), 0)
  INTO v_committed
  FROM checkouts c
  JOIN orders o ON o.id = c.order_id
  WHERE c.item_id = p_item_id
    AND o.status NOT IN ('returned', 'cancelled', 'wishlist_only')
    -- Overlap test: two ranges [a,b] and [x,y] overlap iff a <= y AND b >= x.
    AND c.checkout_date <= p_end
    AND c.return_date   >= p_start;

  RETURN GREATEST(v_total - v_committed, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_quantity(uuid, date, date) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2) Bulk date-aware availability (cart-time / inventory-page lookup)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_available_quantities_bulk(
  p_item_ids uuid[],
  p_start    date,
  p_end      date
)
RETURNS TABLE (
  item_id            uuid,
  total_quantity     integer,
  available_quantity integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'get_available_quantities_bulk: p_start and p_end are required';
  END IF;

  IF p_end < p_start THEN
    RAISE EXCEPTION 'get_available_quantities_bulk: p_end (%) must be >= p_start (%)', p_end, p_start;
  END IF;

  RETURN QUERY
  WITH requested AS (
    SELECT pi.id            AS item_id,
           pi.total_quantity AS total_quantity
    FROM promo_items pi
    WHERE pi.id = ANY(p_item_ids)
  ),
  committed AS (
    SELECT c.item_id,
           SUM(c.quantity)::integer AS committed_qty
    FROM checkouts c
    JOIN orders o ON o.id = c.order_id
    WHERE c.item_id = ANY(p_item_ids)
      AND o.status NOT IN ('returned', 'cancelled', 'wishlist_only')
      AND c.checkout_date <= p_end
      AND c.return_date   >= p_start
    GROUP BY c.item_id
  )
  SELECT
    r.item_id,
    r.total_quantity,
    GREATEST(r.total_quantity - COALESCE(cm.committed_qty, 0), 0) AS available_quantity
  FROM requested r
  LEFT JOIN committed cm ON cm.item_id = r.item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_quantities_bulk(uuid[], date, date) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3) Per-item conflict ranges (PRIVACY-SAFE)
--
-- Returns conflicting reservation windows that overlap the requested date
-- range. Aggregated by (checkout_date, return_date) so a date range that has
-- multiple concurrent reservations comes back as a single row with the total
-- quantity. Intentionally returns ONLY dates + quantity — no order_id,
-- user_name, user_email, or anything that could identify another LO.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_item_conflicts(
  p_item_id uuid,
  p_start   date,
  p_end     date
)
RETURNS TABLE (
  checkout_date  date,
  return_date    date,
  quantity       integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'get_item_conflicts: p_item_id is required';
  END IF;

  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'get_item_conflicts: p_start and p_end are required';
  END IF;

  RETURN QUERY
  SELECT
    c.checkout_date,
    c.return_date,
    SUM(c.quantity)::integer AS quantity
  FROM checkouts c
  JOIN orders o ON o.id = c.order_id
  WHERE c.item_id = p_item_id
    AND o.status NOT IN ('returned', 'cancelled', 'wishlist_only')
    AND c.checkout_date <= p_end
    AND c.return_date   >= p_start
  GROUP BY c.checkout_date, c.return_date
  ORDER BY c.checkout_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_item_conflicts(uuid, date, date) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4) Race-safe, date-aware create_order_with_checkouts
--
-- RPC contract (the client in src/services/orderService.ts depends on this):
--
--   ON SUCCESS (HTTP 200, returned as jsonb):
--     {
--       "success":      true,
--       "order_id":     "<uuid>",
--       "order_number": "VEL26###",
--       "message":      "Order created successfully"
--     }
--
--   ON INSUFFICIENT STOCK (HTTP 200, returned as jsonb — handled by client):
--     {
--       "success":  false,
--       "code":     "INSUFFICIENT_STOCK",
--       "message":  "One or more items are no longer available for the chosen dates",
--       "conflicts": [
--         {
--           "item_id":   "<uuid>",
--           "item_name": "10x10 Tent",
--           "requested": 3,
--           "available": 1
--         },
--         ...
--       ]
--     }
--
--   ON UNRECOVERABLE VALIDATION ERROR (raises Postgres exception, surfaced as
--   error by the client):
--     - missing user_name / user_email
--     - invalid email format
--     - invalid date format
--     - return_date < checkout_date
--     - non-positive item quantity
--     - unknown item id
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, text, text, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, jsonb, text, text, text);
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, text, date, date, date, date, jsonb[]);

CREATE OR REPLACE FUNCTION create_order_with_checkouts(
  p_user_name        text,
  p_user_email       text,
  p_checkout_date    text,
  p_return_date      text,
  p_event_start_date text DEFAULT NULL,
  p_event_end_date   text DEFAULT NULL,
  p_items            jsonb DEFAULT '[]'::jsonb,
  p_status           text DEFAULT 'pending'
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
BEGIN
  -- --- Validate user inputs ---------------------------------------------------
  IF p_user_name IS NULL OR p_user_name = '' THEN
    RAISE EXCEPTION 'User name is required';
  END IF;

  IF p_user_email IS NULL OR p_user_email = '' THEN
    RAISE EXCEPTION 'User email is required';
  END IF;

  IF NOT validate_email(p_user_email) THEN
    RAISE EXCEPTION 'Invalid email format. Please enter a valid email address.';
  END IF;

  -- --- Parse dates -----------------------------------------------------------
  BEGIN
    v_checkout_date := p_checkout_date::date;
    v_return_date   := p_return_date::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid date format. Expected YYYY-MM-DD';
  END;

  IF v_return_date < v_checkout_date THEN
    RAISE EXCEPTION 'Return date must be on or after checkout date';
  END IF;

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

  -- For non-wishlist orders, items are required
  IF p_status = 'pending'
     AND (p_items IS NULL
          OR p_items = '[]'::jsonb
          OR jsonb_array_length(p_items) = 0) THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- --- Lock + validate items (race-safe) -------------------------------------
  IF p_items IS NOT NULL
     AND p_items <> '[]'::jsonb
     AND jsonb_array_length(p_items) > 0 THEN

    -- Collect item ids and lock them in a deterministic ascending order to
    -- prevent deadlocks when two concurrent orders touch overlapping item sets.
    SELECT array_agg(DISTINCT (i->>'item_id')::uuid ORDER BY (i->>'item_id')::uuid)
    INTO v_item_ids
    FROM jsonb_array_elements(p_items) AS i;

    PERFORM 1
    FROM promo_items
    WHERE id = ANY(v_item_ids)
    ORDER BY id ASC
    FOR UPDATE;

    -- Now that the rows are locked, recompute date-aware availability and
    -- compare to requested quantities. We collect ALL conflicts before
    -- returning so the user sees the full picture in one round-trip.
    FOR v_req IN
      SELECT (i->>'item_id')::uuid AS item_id,
             (i->>'quantity')::int  AS quantity
      FROM jsonb_array_elements(p_items) AS i
    LOOP
      IF v_req.quantity IS NULL OR v_req.quantity <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for item %', v_req.quantity, v_req.item_id;
      END IF;

      SELECT id, name, total_quantity
      INTO v_locked
      FROM promo_items
      WHERE id = v_req.item_id;

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
      -- Returning structured failure (NOT raising) so the client can render a
      -- per-item conflict message without parsing exception strings.
      RETURN jsonb_build_object(
        'success',   false,
        'code',      'INSUFFICIENT_STOCK',
        'message',   'One or more items are no longer available for the chosen dates',
        'conflicts', v_conflicts
      );
    END IF;
  END IF;

  -- --- Create order ----------------------------------------------------------
  INSERT INTO orders (
    user_name,
    user_email,
    checkout_date,
    return_date,
    event_start_date,
    event_end_date,
    status
  ) VALUES (
    p_user_name,
    p_user_email,
    v_checkout_date,
    v_return_date,
    v_event_start,
    v_event_end,
    p_status::order_status
  ) RETURNING id INTO v_order_id;

  SELECT order_number INTO v_order_number
  FROM orders WHERE id = v_order_id;

  -- --- Create checkouts + maintain legacy snapshot ---------------------------
  -- We still decrement the legacy `available_quantity` column so existing
  -- readers (older edge functions, the admin InventoryTable, etc.) keep
  -- showing a reasonable approximation. The authoritative source going
  -- forward is `get_available_quantity`.
  IF p_items IS NOT NULL
     AND p_items <> '[]'::jsonb
     AND jsonb_array_length(p_items) > 0 THEN

    FOR v_req IN
      SELECT (i->>'item_id')::uuid AS item_id,
             (i->>'quantity')::int  AS quantity
      FROM jsonb_array_elements(p_items) AS i
    LOOP
      INSERT INTO checkouts (order_id, item_id, quantity)
      VALUES (v_order_id, v_req.item_id, v_req.quantity);

      UPDATE promo_items
      SET available_quantity = GREATEST(available_quantity - v_req.quantity, 0),
          updated_at = now()
      WHERE id = v_req.item_id;
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

GRANT EXECUTE ON FUNCTION create_order_with_checkouts(text, text, text, text, text, text, jsonb, text)
  TO anon, authenticated;
