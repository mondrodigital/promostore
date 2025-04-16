-- Drop existing function
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, text, date, date, jsonb);

-- Create improved function with better parameter handling and error logging
CREATE OR REPLACE FUNCTION create_order_with_checkouts(
  p_user_name text,
  p_user_email text,
  p_checkout_date text, -- Changed to text to match frontend date format
  p_return_date text,   -- Changed to text to match frontend date format
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item record;
  v_result jsonb;
  v_error text;
  v_available integer;
  v_item_name text;
  v_checkout_date date;
  v_return_date date;
BEGIN
  -- Convert date strings to date type
  BEGIN
    v_checkout_date := p_checkout_date::date;
    v_return_date := p_return_date::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid date format. Expected YYYY-MM-DD, got checkout: %, return: %', 
      p_checkout_date, p_return_date;
  END;

  -- Input validation with detailed errors
  IF p_user_name IS NULL OR p_user_name = '' THEN
    RAISE EXCEPTION 'User name is required';
  END IF;

  IF p_user_email IS NULL OR p_user_email = '' THEN
    RAISE EXCEPTION 'User email is required';
  END IF;

  IF v_checkout_date IS NULL THEN
    RAISE EXCEPTION 'Checkout date is required';
  END IF;

  IF v_return_date IS NULL THEN
    RAISE EXCEPTION 'Return date is required';
  END IF;

  IF v_return_date <= v_checkout_date THEN
    RAISE EXCEPTION 'Return date (%) must be after checkout date (%)',
      v_return_date, v_checkout_date;
  END IF;

  IF p_items IS NULL OR p_items = '[]'::jsonb THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Validate items format
  IF NOT (
    SELECT bool_and(
      (value->>'item_id') IS NOT NULL AND 
      (value->>'quantity') IS NOT NULL AND
      (value->>'quantity')::integer > 0
    )
    FROM jsonb_array_elements(p_items)
  ) THEN
    RAISE EXCEPTION 'Invalid items format. Each item must have item_id and quantity > 0';
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
    END LOOP;

    -- Create the order
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

    -- Create checkouts for each item
    FOR v_item IN 
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      -- Create the checkout
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

    -- Prepare success response
    SELECT jsonb_build_object(
      'success', true,
      'order_id', v_order_id,
      'message', 'Order created successfully',
      'details', jsonb_build_object(
        'user_name', p_user_name,
        'user_email', p_user_email,
        'checkout_date', v_checkout_date,
        'return_date', v_return_date,
        'items', p_items
      )
    ) INTO v_result;

    -- Log successful order creation
    INSERT INTO checkout_logs (
      operation,
      checkout_data
    ) VALUES (
      'CREATE_ORDER',
      jsonb_build_object(
        'order_id', v_order_id,
        'user_name', p_user_name,
        'user_email', p_user_email,
        'checkout_date', v_checkout_date,
        'return_date', v_return_date,
        'items', p_items
      )
    );

    RETURN v_result;

  EXCEPTION WHEN OTHERS THEN
    -- Get error details
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    
    -- Log error with full context
    INSERT INTO checkout_logs (
      operation,
      error_message,
      checkout_data
    ) VALUES (
      'CREATE_ORDER_ERROR',
      v_error,
      jsonb_build_object(
        'user_name', p_user_name,
        'user_email', p_user_email,
        'checkout_date', p_checkout_date,
        'return_date', p_return_date,
        'items', p_items,
        'error', v_error
      )
    );

    -- Re-raise the error with more context
    RAISE EXCEPTION 'Order creation failed: %. Check checkout_logs for details.', v_error;
  END;
END;
$$;