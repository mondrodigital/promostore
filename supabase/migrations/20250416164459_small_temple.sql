-- Update the order creation function with better error handling
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
  v_requested integer;
  v_error_items jsonb := '[]'::jsonb;
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

  -- First verify all items exist and have sufficient quantity
  FOR v_item IN 
    SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
  LOOP
    -- Get item details
    SELECT 
      name, 
      available_quantity,
      v_item.quantity
    INTO v_item_name, v_available, v_requested
    FROM promo_items 
    WHERE id = v_item.item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item with ID % not found', v_item.item_id;
    END IF;

    IF v_requested <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity % for item %', v_requested, v_item_name;
    END IF;

    IF v_requested > v_available THEN
      v_error_items := v_error_items || jsonb_build_object(
        'name', v_item_name,
        'requested', v_requested,
        'available', v_available
      );
    END IF;
  END LOOP;

  -- If any items have insufficient quantity, return detailed error
  IF jsonb_array_length(v_error_items) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient quantity for one or more items',
      'details', v_error_items
    );
  END IF;

  -- Start transaction
  BEGIN
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

    -- Create checkouts and update inventory
    FOR v_item IN 
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      -- Create checkout
      INSERT INTO checkouts (
        order_id,
        item_id,
        quantity
      ) VALUES (
        v_order_id,
        v_item.item_id,
        v_item.quantity
      );

      -- Update inventory
      UPDATE promo_items
      SET 
        available_quantity = available_quantity - v_item.quantity,
        updated_at = now()
      WHERE id = v_item.item_id;
    END LOOP;

    -- Return success response
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