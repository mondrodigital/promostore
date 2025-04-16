-- Create function to update order status
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
BEGIN
  -- Get current status and lock the row
  SELECT status INTO v_old_status
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Validate status transition
  IF v_old_status = p_new_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Status unchanged'
    );
  END IF;

  -- Validate status transitions
  CASE v_old_status
    WHEN 'pending' THEN
      IF NOT p_new_status = ANY(ARRAY['picked_up'::order_status, 'cancelled'::order_status]) THEN
        RAISE EXCEPTION 'Invalid status transition from pending to %', p_new_status;
      END IF;
    WHEN 'picked_up' THEN
      IF NOT p_new_status = 'returned'::order_status THEN
        RAISE EXCEPTION 'Invalid status transition from picked_up to %', p_new_status;
      END IF;
    WHEN 'returned' THEN
      RAISE EXCEPTION 'Cannot change status of returned orders';
    WHEN 'cancelled' THEN
      RAISE EXCEPTION 'Cannot change status of cancelled orders';
  END CASE;

  -- Update order status
  UPDATE orders
  SET status = p_new_status
  WHERE id = p_order_id;

  -- Handle inventory updates based on status change
  IF v_old_status = 'pending' AND p_new_status = 'cancelled' THEN
    -- Return items to inventory when cancelling a pending order
    UPDATE promo_items pi
    SET available_quantity = pi.available_quantity + c.quantity
    FROM checkouts c
    WHERE c.order_id = p_order_id
    AND c.item_id = pi.id;
  ELSIF v_old_status = 'picked_up' AND p_new_status = 'returned' THEN
    -- Return items to inventory when order is returned
    UPDATE promo_items pi
    SET available_quantity = pi.available_quantity + c.quantity
    FROM checkouts c
    WHERE c.order_id = p_order_id
    AND c.item_id = pi.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Status updated successfully',
    'new_status', p_new_status
  );
END;
$$;