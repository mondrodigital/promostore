-- Create function to get wishlist items with proper JOIN for Edge Function
CREATE OR REPLACE FUNCTION get_wishlist_items_with_details(order_ids uuid[])
RETURNS TABLE (
    id integer,
    order_id uuid,
    requested_quantity integer,
    status text,
    promo_items jsonb
) 
LANGUAGE sql
AS $$
    SELECT 
        wr.id,
        wr.order_id,
        wr.requested_quantity,
        wr.status,
        jsonb_build_object(
            'id', pi.id,
            'name', pi.name,
            'image_url', pi.image_url,
            'description', pi.description,
            'available_quantity', pi.available_quantity
        ) as promo_items
    FROM wishlist_requests wr
    JOIN promo_items pi ON wr.item_id = pi.id
    WHERE wr.order_id = ANY(order_ids);
$$; 