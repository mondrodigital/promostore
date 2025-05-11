-- Drop the previous version of the function
DROP FUNCTION IF EXISTS update_order_status(uuid, order_status);

-- Create function to handle order status changes and queue wishlist notifications
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
  v_item_id uuid;
  v_returned_quantity int;
  v_fulfilled_request RECORD;
  v_user_payload jsonb;
  v_marketing_payload jsonb;
  v_marketing_email TEXT;
BEGIN
  -- Get current status and lock the row
  SELECT status INTO v_old_status
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- Validate status transition
  IF v_old_status = p_new_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Status unchanged'
    );
  END IF;

  CASE v_old_status
    WHEN 'pending' THEN
      IF NOT p_new_status = ANY(ARRAY['picked_up'::order_status, 'cancelled'::order_status]) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status transition from pending to ' || p_new_status);
      END IF;
    WHEN 'picked_up' THEN
      IF NOT p_new_status = 'returned'::order_status THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid status transition from picked_up to ' || p_new_status);
      END IF;
    WHEN 'returned' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Cannot change status of returned orders');
    WHEN 'cancelled' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Cannot change status of cancelled orders');
  END CASE;

  -- Update order status first
  UPDATE orders
  SET status = p_new_status
  WHERE id = p_order_id;

  -- Handle inventory updates based on status change
  IF v_old_status = 'pending' AND p_new_status = 'cancelled' THEN
    -- Return items to inventory when cancelling a pending order
    WITH quantities AS (
      SELECT 
        c.item_id as id,
        c.quantity as cancel_quantity
      FROM checkouts c
      WHERE c.order_id = p_order_id
    )
    UPDATE promo_items pi
    SET available_quantity = pi.available_quantity + q.cancel_quantity
    FROM quantities q
    WHERE pi.id = q.id;

    -- No need to check wishlist here, items were never picked up.
  
  ELSIF v_old_status = 'picked_up' AND p_new_status = 'returned' THEN
    -- Mark checkout items as returned FIRST
    UPDATE checkouts
    SET returned = true
    WHERE order_id = p_order_id;

    -- Loop through returned items to update inventory AND check wishlists
    FOR v_item_id, v_returned_quantity IN 
        SELECT c.item_id, c.quantity
        FROM checkouts c
        WHERE c.order_id = p_order_id
    LOOP
        -- Update inventory for the specific item
        UPDATE promo_items
        SET available_quantity = available_quantity + v_returned_quantity
        WHERE id = v_item_id;

        -- ** NEW: Check for fulfilled wishlist requests for this item **
        -- Find pending wishlist requests for this item where the quantity is now available
        -- and the requested dates overlap/are relevant (this date logic might need refinement)
        -- We sort by created_at to fulfill oldest requests first.
        FOR v_fulfilled_request IN
            SELECT 
                wr.id as wishlist_request_id,
                wr.user_email,
                u.full_name as user_name, -- Assuming users table has full_name
                wr.order_id as associated_order_id,
                o.checkout_date as requested_pickup_date,
                o.return_date as requested_return_date,
                pi.name as item_name,
                wr.requested_quantity,
                pi.id as item_id,
                wr.created_at as wishlist_created_at
            FROM wishlist_requests wr
            JOIN promo_items pi ON wr.item_id = pi.id
            JOIN orders o ON wr.order_id = o.id -- Join orders to get dates
            JOIN auth.users u ON o.user_id = u.id -- Join users to get name
            WHERE wr.item_id = v_item_id
              AND wr.status = 'pending' -- Only consider pending requests
              AND pi.available_quantity >= wr.requested_quantity -- Check if enough quantity is available NOW
              -- TODO: Add date range checking if necessary - currently assumes any return makes it available
              -- AND o.checkout_date <= current_return_date -- Example date condition
              -- AND o.return_date >= current_pickup_date
            ORDER BY wr.created_at ASC -- Fulfill oldest requests first
        LOOP 
            -- Mark the wishlist request as fulfilled (or handle update)
            -- Option 1: Update status (simple)
            UPDATE wishlist_requests
            SET status = 'fulfilled' -- Or a new status like 'queued_for_notification'
            WHERE id = v_fulfilled_request.wishlist_request_id;

            -- Option 2: You might need more complex logic here, like:
            --   - Adding the item to the associated order (if not already complex)
            --   - Decrementing available_quantity again (if adding to order)
            -- For now, just update status and queue notifications.

            -- Get marketing email (assuming it's stored somewhere, e.g., in settings or env var)
            -- Replace this with your actual method of getting the marketing email
            SELECT value INTO v_marketing_email FROM app_settings WHERE key = 'marketing_email_address';
            IF v_marketing_email IS NULL THEN 
              v_marketing_email := 'marketing@example.com'; -- Default fallback
            END IF;

            -- Prepare payloads for email queue
            v_user_payload := jsonb_build_object(
                'customerEmail', v_fulfilled_request.user_email,
                'customerName', v_fulfilled_request.user_name,
                'orderId', v_fulfilled_request.associated_order_id, 
                'itemName', v_fulfilled_request.item_name,
                'itemQuantity', v_fulfilled_request.requested_quantity,
                'pickupDate', COALESCE(v_fulfilled_request.requested_pickup_date::text, 'N/A'),
                'returnDate', COALESCE(v_fulfilled_request.requested_return_date::text, 'N/A')
            );

            v_marketing_payload := jsonb_build_object(
                'marketingEmail', v_marketing_email, 
                'customerEmail', v_fulfilled_request.user_email,
                'customerName', v_fulfilled_request.user_name,
                'orderId', v_fulfilled_request.associated_order_id,
                'itemName', v_fulfilled_request.item_name,
                'itemQuantity', v_fulfilled_request.requested_quantity,
                'pickupDate', COALESCE(v_fulfilled_request.requested_pickup_date::text, 'N/A'),
                'returnDate', COALESCE(v_fulfilled_request.requested_return_date::text, 'N/A'),
                'wishlistCreatedAt', COALESCE(v_fulfilled_request.wishlist_created_at::text, 'N/A')
            );

            -- Insert into email queue for user notification
            INSERT INTO email_queue (notification_type, payload, status)
            VALUES ('wishlist_user', v_user_payload, 'pending');

            -- Insert into email queue for marketing notification
            INSERT INTO email_queue (notification_type, payload, status)
            VALUES ('wishlist_marketing', v_marketing_payload, 'pending');
            
            -- Decrement available quantity again since we fulfilled a request
            UPDATE promo_items 
            SET available_quantity = available_quantity - v_fulfilled_request.requested_quantity
            WHERE id = v_item_id;

            -- Exit loop for this item if only fulfilling one request per return?
            -- Or continue to fulfill multiple requests if quantity allows?
            -- Current logic continues checking for more requests for the same item.

        END LOOP; -- end loop for fulfilled requests
    END LOOP; -- end loop for returned items

  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Status updated successfully to ' || p_new_status,
    'new_status', p_new_status
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error maybe?
    RETURN jsonb_build_object(
      'success', false,
      'message', 'An error occurred: ' || SQLERRM
    );
END;
$$; 