-- Migration: Admin Order Lifecycle (Workstream D)
-- Covers: partial returns, rejected status, actual pickup/return dates, pagination index

-- ============================================================
-- 1. Extend order_status enum with 'rejected'
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'order_status'::regtype
      AND enumlabel = 'rejected'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'rejected';
  END IF;
END;
$$;

-- ============================================================
-- 2. New columns on orders
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason    text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_pickup_date  timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_return_date  timestamptz;

-- ============================================================
-- 3. checkout_returns table for partial / damaged returns
-- ============================================================
CREATE TABLE IF NOT EXISTS checkout_returns (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id      uuid        NOT NULL REFERENCES checkouts(id) ON DELETE CASCADE,
  order_id         uuid        NOT NULL REFERENCES orders(id)    ON DELETE CASCADE,
  returned_quantity int         NOT NULL CHECK (returned_quantity >= 0),
  damaged_quantity  int         NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  return_notes      text,
  returned_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT damaged_le_returned CHECK (damaged_quantity <= returned_quantity)
);

CREATE INDEX IF NOT EXISTS idx_checkout_returns_checkout_id ON checkout_returns(checkout_id);
CREATE INDEX IF NOT EXISTS idx_checkout_returns_order_id    ON checkout_returns(order_id);

-- ============================================================
-- 4. Pagination index on orders
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders(status, created_at DESC);

-- ============================================================
-- 5. RPC: process_partial_return
--    Restores only undamaged items to available_quantity.
--    Each checkout line can have multiple partial return records.
-- ============================================================
CREATE OR REPLACE FUNCTION process_partial_return(
  p_checkout_id  uuid,
  p_returned_qty int,
  p_damaged_qty  int,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checkout      RECORD;
  v_undamaged_qty int;
BEGIN
  IF p_returned_qty < 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'returned_quantity cannot be negative');
  END IF;
  IF p_damaged_qty < 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'damaged_quantity cannot be negative');
  END IF;
  IF p_damaged_qty > p_returned_qty THEN
    RETURN jsonb_build_object('success', false, 'message', 'damaged_quantity cannot exceed returned_quantity');
  END IF;

  SELECT c.id, c.item_id, c.order_id, c.quantity, o.status
  INTO v_checkout
  FROM checkouts c
  JOIN orders o ON c.order_id = o.id
  WHERE c.id = p_checkout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Checkout record not found');
  END IF;

  IF v_checkout.status != 'picked_up' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Partial returns can only be processed for picked_up orders (current: ' || v_checkout.status || ')'
    );
  END IF;

  IF p_returned_qty > v_checkout.quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'returned_quantity (' || p_returned_qty || ') exceeds checked-out quantity (' || v_checkout.quantity || ')'
    );
  END IF;

  -- Record the return
  INSERT INTO checkout_returns (checkout_id, order_id, returned_quantity, damaged_quantity, return_notes)
  VALUES (p_checkout_id, v_checkout.order_id, p_returned_qty, p_damaged_qty, p_notes);

  -- Only undamaged items are restored to available inventory
  v_undamaged_qty := p_returned_qty - p_damaged_qty;
  IF v_undamaged_qty > 0 THEN
    UPDATE promo_items
    SET available_quantity = LEAST(available_quantity + v_undamaged_qty, total_quantity)
    WHERE id = v_checkout.item_id;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'message',          'Return processed successfully',
    'restored_quantity', v_undamaged_qty,
    'damaged_quantity',  p_damaged_qty
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Error processing return: ' || SQLERRM);
END;
$$;

-- ============================================================
-- 6. RPC: reject_order
--    Transitions pending -> rejected, stores reason, restores inventory.
-- ============================================================
CREATE OR REPLACE FUNCTION reject_order(
  p_order_id uuid,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status order_status;
BEGIN
  SELECT status INTO v_old_status
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  IF v_old_status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Only pending orders can be rejected (current status: ' || v_old_status || ')'
    );
  END IF;

  UPDATE orders
  SET status           = 'rejected',
      rejection_reason = p_reason
  WHERE id = p_order_id;

  -- Restore checked-out inventory (same logic as cancellation)
  WITH quantities AS (
    SELECT
      pi.id,
      pi.total_quantity,
      pi.available_quantity,
      c.quantity AS return_quantity
    FROM promo_items pi
    JOIN checkouts c ON c.item_id = pi.id
    WHERE c.order_id = p_order_id
  )
  UPDATE promo_items pi
  SET available_quantity =
    CASE
      WHEN q.available_quantity + q.return_quantity > q.total_quantity
        THEN q.total_quantity
      ELSE q.available_quantity + q.return_quantity
    END
  FROM quantities q
  WHERE pi.id = q.id;

  RETURN jsonb_build_object('success', true, 'message', 'Order rejected successfully');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Error rejecting order: ' || SQLERRM);
END;
$$;

-- ============================================================
-- 7. Update update_order_status:
--    • Add rejected as a terminal state
--    • Set actual_pickup_date on pending → picked_up
--    • Set actual_return_date on picked_up → returned
--    • Allow wishlist_only → rejected (edge case)
-- ============================================================
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id  uuid,
  p_new_status order_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status order_status;
BEGIN
  SELECT status INTO v_old_status
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  IF v_old_status = p_new_status THEN
    RETURN jsonb_build_object('success', true, 'message', 'Status unchanged');
  END IF;

  -- Validate transitions
  CASE v_old_status
    WHEN 'pending' THEN
      IF NOT p_new_status = ANY(ARRAY['picked_up'::order_status, 'cancelled'::order_status]) THEN
        RETURN jsonb_build_object(
          'success', false,
          'message', 'Invalid transition from pending to ' || p_new_status
        );
      END IF;
    WHEN 'picked_up' THEN
      IF NOT p_new_status = 'returned'::order_status THEN
        RETURN jsonb_build_object(
          'success', false,
          'message', 'Invalid transition from picked_up to ' || p_new_status
        );
      END IF;
    WHEN 'wishlist_only' THEN
      IF NOT p_new_status = 'cancelled'::order_status THEN
        RETURN jsonb_build_object(
          'success', false,
          'message', 'Invalid transition from wishlist_only to ' || p_new_status
        );
      END IF;
    WHEN 'returned' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Cannot change status of returned orders');
    WHEN 'cancelled' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Cannot change status of cancelled orders');
    WHEN 'rejected' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Cannot change status of rejected orders');
    ELSE
      RETURN jsonb_build_object('success', false, 'message', 'Unknown current status: ' || v_old_status);
  END CASE;

  -- Update status and set actual date timestamps
  UPDATE orders
  SET status             = p_new_status,
      actual_pickup_date = CASE
                             WHEN v_old_status = 'pending' AND p_new_status = 'picked_up'
                             THEN now()
                             ELSE actual_pickup_date
                           END,
      actual_return_date = CASE
                             WHEN v_old_status = 'picked_up' AND p_new_status = 'returned'
                             THEN now()
                             ELSE actual_return_date
                           END
  WHERE id = p_order_id;

  -- Inventory adjustments
  IF v_old_status = 'pending' AND p_new_status = 'cancelled' THEN
    WITH quantities AS (
      SELECT
        pi.id,
        pi.total_quantity,
        pi.available_quantity,
        c.quantity AS return_quantity
      FROM promo_items pi
      JOIN checkouts c ON c.item_id = pi.id
      WHERE c.order_id = p_order_id
    )
    UPDATE promo_items pi
    SET available_quantity =
      CASE
        WHEN q.available_quantity + q.return_quantity > q.total_quantity
          THEN q.total_quantity
        ELSE q.available_quantity + q.return_quantity
      END
    FROM quantities q
    WHERE pi.id = q.id;

  ELSIF v_old_status = 'picked_up' AND p_new_status = 'returned' THEN
    WITH quantities AS (
      SELECT
        pi.id,
        pi.total_quantity,
        pi.available_quantity,
        c.quantity AS return_quantity
      FROM promo_items pi
      JOIN checkouts c ON c.item_id = pi.id
      WHERE c.order_id = p_order_id
    )
    UPDATE promo_items pi
    SET available_quantity =
      CASE
        WHEN q.available_quantity + q.return_quantity > q.total_quantity
          THEN q.total_quantity
        ELSE q.available_quantity + q.return_quantity
      END
    FROM quantities q
    WHERE pi.id = q.id;
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'message',    'Status updated successfully to ' || p_new_status,
    'new_status', p_new_status
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'An error occurred: ' || SQLERRM);
END;
$$;
