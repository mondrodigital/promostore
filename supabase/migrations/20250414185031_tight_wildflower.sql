-- Drop existing functions
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, jsonb, text, text, text);
DROP FUNCTION IF EXISTS update_order_status(uuid, order_status);

-- Create improved function to handle order creation with proper inventory management
CREATE OR REPLACE FUNCTION create_order_with_checkouts(
  p_checkout_date text,
  p_items jsonb,
  p_return_date text,
  p_user_email text,
  p_user_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item record;
  v_checkout_date date;
  v_return_date date;
  v_item_name text;
  v_available integer;
BEGIN
  -- Convert dates
  BEGIN
    v_checkout_date := p_checkout_date::date;
    v_return_date := p_return_date::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid date format. Expected YYYY-MM-DD';
  END;

  -- Validate input
  IF p_user_name IS NULL OR p_user_name = '' THEN
    RAISE EXCEPTION 'User name is required';
  END IF;

  IF p_user_email IS NULL OR p_user_email = '' THEN
    RAISE EXCEPTION 'User email is required';
  END IF;

  IF v_return_date <= v_checkout_date THEN
    RAISE EXCEPTION 'Return date must be after checkout date';
  END IF;

  IF p_items IS NULL OR p_items = '[]'::jsonb OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Start transaction
  BEGIN
    -- First verify all items exist and have sufficient quantity
    FOR v_item IN 
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      -- Get item details and lock the row
      SELECT name, available_quantity 
      INTO v_item_name, v_available
      FROM promo_items 
      WHERE id = v_item.item_id 
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item with ID % not found', v_item.item_id;
      END IF;

      IF v_item.quantity <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for item %', v_item.quantity, v_item_name;
      END IF;

      IF v_item.quantity > v_available THEN
        RAISE EXCEPTION 'Insufficient quantity for item %. Requested: %, Available: %',
          v_item_name, v_item.quantity, v_available;
      END IF;

      -- Update inventory immediately
      UPDATE promo_items
      SET 
        available_quantity = available_quantity - v_item.quantity,
        updated_at = now()
      WHERE id = v_item.item_id;
    END LOOP;

    -- Create order
    INSERT INTO orders (
      user_name,
      user_email,
      checkout_date,
      return_date,
      status
    ) VALUES (
      p_user_name,
      p_user_email,
      v_checkout_date,
      v_return_date,
      'pending'
    ) RETURNING id INTO v_order_id;

    -- Create checkouts
    FOR v_item IN 
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      INSERT INTO checkouts (
        order_id,
        item_id,
        quantity
      ) VALUES (
        v_order_id,
        v_item.item_id,
        v_item.quantity
      );
    END LOOP;

    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_order_id,
      'message', 'Order created successfully'
    );

  EXCEPTION WHEN OTHERS THEN
    -- Re-raise the error with context
    RAISE EXCEPTION 'Failed to create order: %', SQLERRM;
  END;
END;
$$;

-- Create improved function to handle order status changes
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
    SET 
      available_quantity = pi.available_quantity + c.quantity,
      updated_at = now()
    FROM checkouts c
    WHERE c.order_id = p_order_id
    AND c.item_id = pi.id;
  ELSIF v_old_status = 'picked_up' AND p_new_status = 'returned' THEN
    -- Return items to inventory when order is returned
    UPDATE promo_items pi
    SET 
      available_quantity = pi.available_quantity + c.quantity,
      updated_at = now()
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

-- Reset all inventory quantities to match actual state
WITH order_quantities AS (
  SELECT 
    c.item_id,
    SUM(CASE 
      WHEN o.status IN ('pending', 'picked_up') THEN c.quantity 
      ELSE 0 
    END) as checked_out_quantity
  FROM checkouts c
  JOIN orders o ON c.order_id = o.id
  GROUP BY c.item_id
)
UPDATE promo_items pi
SET available_quantity = pi.total_quantity - COALESCE(
  (SELECT checked_out_quantity FROM order_quantities WHERE item_id = pi.id),
  0
);