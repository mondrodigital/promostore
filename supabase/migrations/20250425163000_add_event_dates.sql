-- Add event date columns to orders table
ALTER TABLE orders
ADD COLUMN event_start_date DATE,
ADD COLUMN event_end_date DATE;

-- Update the create_order_with_checkouts function to include event dates
CREATE OR REPLACE FUNCTION create_order_with_checkouts(
    p_user_name TEXT,
    p_user_email TEXT,
    p_checkout_date DATE,
    p_return_date DATE,
    p_event_start_date DATE,
    p_event_end_date DATE,
    p_items JSONB[]
) RETURNS TABLE (
    order_id UUID,
    success BOOLEAN,
    message TEXT
) LANGUAGE plpgsql AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
    v_available BOOLEAN;
BEGIN
    -- Start transaction
    BEGIN
        -- Create the order
        INSERT INTO orders (
            user_name,
            user_email,
            pickup_date,
            return_date,
            event_start_date,
            event_end_date,
            status
        ) VALUES (
            p_user_name,
            p_user_email,
            p_checkout_date,
            p_return_date,
            p_event_start_date,
            p_event_end_date,
            'pending'
        ) RETURNING id INTO v_order_id;

        -- For each item in the order
        FOREACH v_item IN ARRAY p_items
        LOOP
            -- Check if enough quantity is available
            SELECT (available_quantity >= (v_item->>'quantity')::integer)
            INTO v_available
            FROM promo_items
            WHERE id = (v_item->>'item_id')::uuid;

            IF NOT v_available THEN
                RAISE EXCEPTION 'Not enough quantity available for item %', (v_item->>'item_id')::uuid;
            END IF;

            -- Create checkout record
            INSERT INTO checkouts (
                order_id,
                item_id,
                quantity
            ) VALUES (
                v_order_id,
                (v_item->>'item_id')::uuid,
                (v_item->>'quantity')::integer
            );
        END LOOP;

        RETURN QUERY SELECT v_order_id, TRUE, 'Order created successfully';
        
    EXCEPTION WHEN OTHERS THEN
        -- If any error occurs, roll back and return error
        RAISE NOTICE 'Error creating order: %', SQLERRM;
        RETURN QUERY SELECT NULL::uuid, FALSE, SQLERRM;
    END;
END;
$$; 