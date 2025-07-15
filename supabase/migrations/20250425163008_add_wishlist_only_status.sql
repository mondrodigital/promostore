-- Add 'wishlist_only' to the order_status enum
ALTER TYPE order_status ADD VALUE 'wishlist_only';

-- Update any existing functions that validate status transitions
-- to handle wishlist_only orders appropriately
DROP FUNCTION IF EXISTS update_order_status(uuid, order_status);

CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id uuid,
  p_new_status order_status
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status order_status;
  v_result jsonb;
  v_item_id uuid;
  v_returned_quantity int;
  v_fulfilled_request RECORD;
  v_user_payload jsonb;
  v_marketing_payload jsonb;
  v_marketing_email TEXT;
BEGIN
  -- Get current status and lock the row
  SELECT status INTO v_old_status
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- Validate status transition
  IF v_old_status = p_new_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Status unchanged'
    );
  END IF;

  CASE v_old_status
    WHEN 'pending' THEN
      IF NOT p_new_status = ANY(ARRAY['picked_up'::order_status, 'cancelled'::order_status]) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status transition from pending to ' || p_new_status);
      END IF;
    WHEN 'picked_up' THEN
      IF NOT p_new_status = 'returned'::order_status THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status transition from picked_up to ' || p_new_status);
      END IF;
    WHEN 'wishlist_only' THEN
      IF NOT p_new_status = 'cancelled'::order_status THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status transition from wishlist_only to ' || p_new_status);
      END IF;
    WHEN 'returned' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Cannot change status of returned orders');
    WHEN 'cancelled' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Cannot change status of cancelled orders');
  END CASE;

  -- Update order status first
  UPDATE orders
  SET status = p_new_status
  WHERE id = p_order_id;

  -- Handle inventory updates based on status change
  -- (wishlist_only orders don't affect inventory since no items are checked out)
  IF v_old_status = 'pending' AND p_new_status = 'cancelled' THEN
    -- Return items to inventory when cancelling a pending order
    WITH quantities AS (
      SELECT 
        pi.id,
        pi.total_quantity,
        pi.available_quantity,
        c.quantity as return_quantity
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
    -- Return items to inventory when order is returned
    WITH quantities AS (
      SELECT 
        pi.id,
        pi.total_quantity,
        pi.available_quantity,
        c.quantity as return_quantity
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

    -- Mark items as returned (if checkouts table has a returned column)
    UPDATE checkouts
    SET returned = true
    WHERE order_id = p_order_id
    AND EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'checkouts' AND column_name = 'returned');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Status updated successfully to ' || p_new_status,
    'new_status', p_new_status
  );
END;
$$;
