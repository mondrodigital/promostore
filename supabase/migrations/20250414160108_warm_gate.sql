/*
  # Add stored procedure for order creation

  1. Changes
    - Add stored procedure to handle order creation
    - Add better error handling and validation
    - Add detailed logging
    - Fix transaction handling
*/

-- Create a type for order items if it doesn't exist
DO $$ BEGIN
  CREATE TYPE order_item_type AS (
    item_id uuid,
    quantity integer
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create a function to validate order items
CREATE OR REPLACE FUNCTION validate_order_items(p_items jsonb)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_item record;
  v_available integer;
  v_name text;
BEGIN
  FOR v_item IN 
    SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
  LOOP
    -- Check if item exists and get available quantity
    SELECT name, available_quantity 
    INTO v_name, v_available
    FROM promo_items 
    WHERE id = v_item.item_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item with ID % not found', v_item.item_id;
    END IF;
    
    IF v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity % for item %', v_item.quantity, v_name;
    END IF;
    
    IF v_item.quantity > v_available THEN
      RAISE EXCEPTION 'Insufficient quantity for item %. Requested: %, Available: %',
        v_name, v_item.quantity, v_available;
    END IF;
  END LOOP;
  
  RETURN true;
END;
$$;

-- Create or replace the main order creation function
CREATE OR REPLACE FUNCTION create_order_with_checkouts(
  p_user_name text,
  p_user_email text,
  p_checkout_date date,
  p_return_date date,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_item record;
  v_result jsonb;
  v_error text;
BEGIN
  -- Validate input parameters
  IF p_user_name IS NULL OR p_user_name = '' THEN
    RAISE EXCEPTION 'User name is required';
  END IF;
  
  IF p_user_email IS NULL OR p_user_email = '' THEN
    RAISE EXCEPTION 'User email is required';
  END IF;
  
  IF p_checkout_date IS NULL THEN
    RAISE EXCEPTION 'Checkout date is required';
  END IF;
  
  IF p_return_date IS NULL THEN
    RAISE EXCEPTION 'Return date is required';
  END IF;
  
  IF p_return_date <= p_checkout_date THEN
    RAISE EXCEPTION 'Return date must be after checkout date';
  END IF;
  
  IF p_items IS NULL OR p_items = '[]'::jsonb THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Validate items and quantities
  PERFORM validate_order_items(p_items);

  -- Start transaction
  BEGIN
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
      p_checkout_date,
      p_return_date,
      'pending'
    ) RETURNING id INTO v_order_id;

    -- Create checkouts for each item
    FOR v_item IN 
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      -- Lock the item row
      PERFORM id 
      FROM promo_items 
      WHERE id = v_item.item_id 
      FOR UPDATE;

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

      -- Update inventory (trigger will handle this)
    END LOOP;

    -- Prepare success response
    SELECT jsonb_build_object(
      'success', true,
      'order_id', v_order_id,
      'message', 'Order created successfully'
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
        'items', p_items
      )
    );

    RETURN v_result;

  EXCEPTION WHEN OTHERS THEN
    -- Get error details
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    
    -- Log error
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
        'items', p_items
      )
    );

    -- Re-raise the error
    RAISE EXCEPTION 'Failed to create order: %', v_error;
  END;
END;
$$;