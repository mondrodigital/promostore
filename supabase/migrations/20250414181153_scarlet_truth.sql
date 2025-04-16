-- Add policy for admins to update orders
CREATE POLICY "Admins can update orders"
  ON orders
  FOR UPDATE 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Create function to handle order status changes
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
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Status updated successfully'
  );
END;
$$;