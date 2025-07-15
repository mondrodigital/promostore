CREATE OR REPLACE FUNCTION add_wishlist_requests(requests jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    request_item jsonb;
BEGIN
    FOR request_item IN SELECT * FROM jsonb_array_elements(requests)
    LOOP
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