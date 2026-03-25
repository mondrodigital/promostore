CREATE OR REPLACE FUNCTION delete_orders_with_restore(p_order_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_deleted_count integer := 0;
BEGIN
  FOR v_order IN
    SELECT id, status FROM orders WHERE id = ANY(p_order_ids) FOR UPDATE
  LOOP
    -- Restore inventory for orders that had items checked out
    IF v_order.status IN ('pending', 'picked_up') THEN
      UPDATE promo_items pi
      SET available_quantity = LEAST(pi.total_quantity, pi.available_quantity + c.quantity)
      FROM checkouts c
      WHERE c.order_id = v_order.id
        AND c.item_id = pi.id;
    END IF;

    -- Delete related wishlist requests
    DELETE FROM wishlist_requests WHERE order_id = v_order.id;

    -- Delete checkouts
    DELETE FROM checkouts WHERE order_id = v_order.id;

    -- Delete the order
    DELETE FROM orders WHERE id = v_order.id;

    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', v_deleted_count || ' order(s) deleted successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '%', SQLERRM;
END;
$$;
