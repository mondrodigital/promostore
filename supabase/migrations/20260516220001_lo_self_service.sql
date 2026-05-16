-- Migration: LO self-service — cancel own pending orders
-- Adds an RPC that lets an LO cancel their own pending order by verifying
-- the caller-supplied email against orders.user_email.

CREATE OR REPLACE FUNCTION lo_cancel_order(
  p_order_id   uuid,
  p_user_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_email  text;
  v_order_status order_status;
BEGIN
  SELECT user_email, status
  INTO   v_order_email, v_order_status
  FROM   orders
  WHERE  id = p_order_id
  FOR    UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF lower(v_order_email) <> lower(p_user_email) THEN
    RAISE EXCEPTION 'Not authorized to cancel this order';
  END IF;

  IF v_order_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be cancelled (current status: %)', v_order_status;
  END IF;

  -- Set status to cancelled
  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;

  -- Restore inventory quantities
  UPDATE promo_items pi
  SET
    available_quantity = pi.available_quantity + c.quantity,
    updated_at         = now()
  FROM checkouts c
  WHERE c.order_id = p_order_id
    AND c.item_id  = pi.id;

  RETURN jsonb_build_object('success', true, 'message', 'Order cancelled successfully');
END;
$$;
