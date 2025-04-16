/*
  # Fix order creation function parameter order

  1. Changes
    - Update function parameter order to match frontend expectations
    - Add better error handling
    - Improve validation messages
*/

-- Drop existing function
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, text, text, text, jsonb);

-- Create function with correct parameter order
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
  v_result jsonb;
  v_error text;
  v_checkout_date date;
  v_return_date date;
BEGIN
  -- Convert dates
  BEGIN
    v_checkout_date := p_checkout_date::date;
    v_return_date := p_return_date::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid date format. Expected YYYY-MM-DD, got checkout: %, return: %', 
      p_checkout_date, p_return_date;
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

  IF p_items IS NULL OR p_items = '[]'::jsonb THEN
    RAISE EXCEPTION 'Order must contain at least one item';
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

    -- Process each item
    FOR v_item IN 
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      -- Verify and lock item
      IF NOT EXISTS (
        SELECT 1 FROM promo_items
        WHERE id = v_item.item_id
        AND available_quantity >= v_item.quantity
        FOR UPDATE
      ) THEN
        RAISE EXCEPTION 'Item % not available in requested quantity', v_item.item_id;
      END IF;

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
      SET available_quantity = available_quantity - v_item.quantity
      WHERE id = v_item.item_id;
    END LOOP;

    -- Return success
    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_order_id,
      'message', 'Order created successfully'
    );

  EXCEPTION WHEN OTHERS THEN
    -- Log error
    INSERT INTO checkout_logs (
      operation,
      error_message,
      checkout_data
    ) VALUES (
      'CREATE_ORDER_ERROR',
      SQLERRM,
      jsonb_build_object(
        'user_name', p_user_name,
        'user_email', p_user_email,
        'checkout_date', p_checkout_date,
        'return_date', p_return_date,
        'items', p_items
      )
    );

    RAISE;
  END;
END;
$$;