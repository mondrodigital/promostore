-- Drop existing overloads of create_order_with_checkouts
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, jsonb, text, text, text);
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, text, date, date, date, date, jsonb[]);

CREATE OR REPLACE FUNCTION create_order_with_checkouts(
  p_user_name text,
  p_user_email text,
  p_checkout_date text,
  p_return_date text,
  p_event_start_date text DEFAULT NULL,
  p_event_end_date text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_status text DEFAULT 'pending'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_item record;
  v_checkout_date date;
  v_return_date date;
  v_event_start date;
  v_event_end date;
  v_item_name text;
  v_available integer;
BEGIN
  IF p_user_name IS NULL OR p_user_name = '' THEN
    RAISE EXCEPTION 'User name is required';
  END IF;

  IF p_user_email IS NULL OR p_user_email = '' THEN
    RAISE EXCEPTION 'User email is required';
  END IF;

  IF NOT validate_email(p_user_email) THEN
    RAISE EXCEPTION 'Invalid email format. Please enter a valid email address.';
  END IF;

  BEGIN
    v_checkout_date := p_checkout_date::date;
    v_return_date := p_return_date::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid date format. Expected YYYY-MM-DD';
  END;

  IF v_return_date < v_checkout_date THEN
    RAISE EXCEPTION 'Return date must be on or after checkout date';
  END IF;

  -- Parse optional event dates
  IF p_event_start_date IS NOT NULL AND p_event_start_date != '' THEN
    BEGIN
      v_event_start := p_event_start_date::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid event start date format. Expected YYYY-MM-DD';
    END;
  END IF;

  IF p_event_end_date IS NOT NULL AND p_event_end_date != '' THEN
    BEGIN
      v_event_end := p_event_end_date::date;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid event end date format. Expected YYYY-MM-DD';
    END;
  END IF;

  -- For non-wishlist orders, items are required
  IF p_status = 'pending' AND (p_items IS NULL OR p_items = '[]'::jsonb OR jsonb_array_length(p_items) = 0) THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Validate and lock all items first
  IF p_items IS NOT NULL AND p_items != '[]'::jsonb AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
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
  END IF;

  -- Create order
  INSERT INTO orders (
    user_name,
    user_email,
    checkout_date,
    return_date,
    event_start_date,
    event_end_date,
    status
  ) VALUES (
    p_user_name,
    p_user_email,
    v_checkout_date,
    v_return_date,
    v_event_start,
    v_event_end,
    p_status::order_status
  ) RETURNING id INTO v_order_id;

  -- Fetch the auto-generated order_number
  SELECT order_number INTO v_order_number
  FROM orders WHERE id = v_order_id;

  -- Create checkouts and update inventory
  IF p_items IS NOT NULL AND p_items != '[]'::jsonb AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      INSERT INTO checkouts (order_id, item_id, quantity)
      VALUES (v_order_id, v_item.item_id, v_item.quantity);

      UPDATE promo_items
      SET available_quantity = available_quantity - v_item.quantity,
          updated_at = now()
      WHERE id = v_item.item_id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', COALESCE(v_order_number, ''),
    'message', 'Order created successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '%', SQLERRM;
END;
$$;
