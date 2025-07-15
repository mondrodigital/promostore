-- Create fulfill_wishlist_item RPC function
CREATE OR REPLACE FUNCTION fulfill_wishlist_item(
  p_wishlist_request_id integer,
  p_target_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wishlist_request RECORD;
  v_item_available_quantity integer;
  v_item_name text;
BEGIN
  -- Get wishlist request details
  SELECT 
    wr.id,
    wr.order_id,
    wr.user_email,
    wr.user_name,
    wr.item_id,
    wr.requested_quantity,
    wr.status,
    pi.name as item_name,
    pi.available_quantity
  INTO v_wishlist_request
  FROM wishlist_requests wr
  JOIN promo_items pi ON wr.item_id = pi.id
  WHERE wr.id = p_wishlist_request_id;

  -- Check if wishlist request exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Wishlist request not found with ID: ' || p_wishlist_request_id
    );
  END IF;

  -- Check if wishlist request is already fulfilled
  IF v_wishlist_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Wishlist request is not pending (current status: ' || v_wishlist_request.status || ')'
    );
  END IF;

  -- Check if enough inventory is available
  IF v_wishlist_request.available_quantity < v_wishlist_request.requested_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient inventory. Requested: ' || v_wishlist_request.requested_quantity || ', Available: ' || v_wishlist_request.available_quantity
    );
  END IF;

  -- Add item to target order's checkouts
  INSERT INTO checkouts (
    order_id,
    item_id,
    quantity
  ) VALUES (
    p_target_order_id,
    v_wishlist_request.item_id,
    v_wishlist_request.requested_quantity
  );

  -- Update inventory (decrease available quantity)
  UPDATE promo_items
  SET available_quantity = available_quantity - v_wishlist_request.requested_quantity
  WHERE id = v_wishlist_request.item_id;

  -- Update wishlist request status
  UPDATE wishlist_requests
  SET status = 'added_to_order'
  WHERE id = p_wishlist_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Wishlist item successfully added to order'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'message', 'Database error: ' || SQLERRM
  );
END;
$$; 