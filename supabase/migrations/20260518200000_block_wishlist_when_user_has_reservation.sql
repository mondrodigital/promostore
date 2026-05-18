-- Prevent wishlist requests when the same user already holds an active checkout
-- (pending / picked_up) for the same item on overlapping dates.

CREATE OR REPLACE FUNCTION get_user_overlapping_reservations(
  p_user_email text,
  p_item_id    uuid,
  p_start      date,
  p_end        date
)
RETURNS TABLE (
  order_id       uuid,
  order_number   text,
  checkout_date  date,
  return_date    date,
  status         order_status,
  quantity       integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.order_number,
    o.checkout_date,
    o.return_date,
    o.status,
    c.quantity::integer
  FROM orders o
  JOIN checkouts c ON c.order_id = o.id
  WHERE lower(trim(o.user_email)) = lower(trim(p_user_email))
    AND c.item_id = p_item_id
    AND o.status IN ('pending', 'picked_up')
    AND o.checkout_date IS NOT NULL
    AND o.return_date IS NOT NULL
    AND o.checkout_date <= p_end
    AND o.return_date >= p_start;
$$;

GRANT EXECUTE ON FUNCTION get_user_overlapping_reservations(text, uuid, date, date)
  TO anon, authenticated;


-- All active checkouts for a user that overlap a date window (powers storefront UI).
CREATE OR REPLACE FUNCTION get_user_reservations_for_window(
  p_user_email text,
  p_start      date,
  p_end        date
)
RETURNS TABLE (
  item_id        uuid,
  order_id       uuid,
  order_number   text,
  checkout_date  date,
  return_date    date,
  status         order_status,
  quantity       integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.item_id,
    o.id,
    o.order_number,
    o.checkout_date,
    o.return_date,
    o.status,
    c.quantity::integer
  FROM orders o
  JOIN checkouts c ON c.order_id = o.id
  WHERE lower(trim(o.user_email)) = lower(trim(p_user_email))
    AND o.status IN ('pending', 'picked_up')
    AND o.checkout_date IS NOT NULL
    AND o.return_date IS NOT NULL
    AND o.checkout_date <= p_end
    AND o.return_date >= p_start;
$$;

GRANT EXECUTE ON FUNCTION get_user_reservations_for_window(text, date, date)
  TO anon, authenticated;


CREATE OR REPLACE FUNCTION add_wishlist_requests(requests jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_item jsonb;
  v_overlap    record;
BEGIN
  FOR request_item IN SELECT * FROM jsonb_array_elements(requests)
  LOOP
    SELECT
      o.order_number,
      o.checkout_date,
      o.return_date
    INTO v_overlap
    FROM orders o
    JOIN checkouts c ON c.order_id = o.id
    WHERE lower(trim(o.user_email)) = lower(trim(request_item->>'user_email'))
      AND c.item_id = (request_item->>'item_id')::uuid
      AND o.status IN ('pending', 'picked_up')
      AND o.checkout_date IS NOT NULL
      AND o.return_date IS NOT NULL
      AND o.checkout_date <= (request_item->>'requested_return_date')::date
      AND o.return_date >= (request_item->>'requested_pickup_date')::date
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'You already have this item on order % (% – %). Cancel or change that order before wishlisting it again.',
        COALESCE(v_overlap.order_number, 'unknown'),
        v_overlap.checkout_date,
        v_overlap.return_date;
    END IF;

    INSERT INTO wishlist_requests (
      order_id,
      user_name,
      user_email,
      item_id,
      requested_quantity,
      requested_pickup_date,
      requested_return_date,
      event_start_date,
      event_end_date,
      status
    ) VALUES (
      (request_item->>'order_id')::uuid,
      request_item->>'user_name',
      request_item->>'user_email',
      (request_item->>'item_id')::uuid,
      (request_item->>'requested_quantity')::integer,
      (request_item->>'requested_pickup_date')::date,
      (request_item->>'requested_return_date')::date,
      (request_item->>'event_start_date')::date,
      (request_item->>'event_end_date')::date,
      request_item->>'status'
    );
  END LOOP;
END;
$$;
