/*
  # Add transaction function for order creation

  1. Changes
    - Add stored procedure to handle order creation in a transaction
    - Ensure proper rollback on failure
    - Add better error handling and validation
*/

-- Create a function to handle order creation in a transaction
CREATE OR REPLACE FUNCTION create_order_with_checkouts(
  p_user_name text,
  p_user_email text,
  p_checkout_date date,
  p_return_date date,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_item record;
  v_result jsonb;
BEGIN
  -- Start transaction
  BEGIN
    -- Create the order first
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
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity int)
    LOOP
      -- Verify item exists and has enough quantity
      IF NOT EXISTS (
        SELECT 1 FROM promo_items
        WHERE id = v_item.item_id
        AND available_quantity >= v_item.quantity
        FOR UPDATE
      ) THEN
        RAISE EXCEPTION 'Item % not found or insufficient quantity', v_item.item_id;
      END IF;

      -- Create the checkout
      INSERT INTO checkouts (
        order_id,
        item_id,
        quantity,
        returned,
        picked_up
      ) VALUES (
        v_order_id,
        v_item.item_id,
        v_item.quantity,
        false,
        false
      );

      -- Update inventory
      UPDATE promo_items
      SET available_quantity = available_quantity - v_item.quantity
      WHERE id = v_item.item_id;
    END LOOP;

    -- Prepare success response
    SELECT jsonb_build_object(
      'success', true,
      'order_id', v_order_id,
      'message', 'Order created successfully'
    ) INTO v_result;

    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    -- Rollback will happen automatically
    RAISE EXCEPTION 'Failed to create order: %', SQLERRM;
  END;
END;
$$;