-- Add order_number column if it doesn't already exist
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;

-- Create or replace function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_year_part TEXT;
    v_sequence INT;
    v_order_number TEXT;
    v_pattern TEXT;
BEGIN
    v_year_part := TO_CHAR(CURRENT_DATE, 'YY');
    v_pattern := '^VEL' || v_year_part || '[0-9]{3}$';

    SELECT COALESCE(MAX(
        CASE
            WHEN order_number ~ v_pattern
            THEN SUBSTRING(order_number FROM LENGTH('VEL' || v_year_part) + 1)::INT
            ELSE 0
        END
    ), 0) + 1
    INTO v_sequence
    FROM orders
    WHERE order_number LIKE 'VEL' || v_year_part || '%';

    v_order_number := 'VEL' || v_year_part || LPAD(v_sequence::TEXT, 3, '0');

    RETURN v_order_number;
END;
$$;

-- Create or replace trigger function
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.order_number IS NULL THEN
        NEW.order_number := generate_order_number();
    END IF;
    RETURN NEW;
END;
$$;

-- Create trigger (idempotent with DROP IF EXISTS)
DROP TRIGGER IF EXISTS trigger_set_order_number ON orders;
CREATE TRIGGER trigger_set_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION set_order_number();

-- Backfill any existing orders missing an order number
DO $$
DECLARE
    order_record RECORD;
BEGIN
    FOR order_record IN
        SELECT id FROM orders WHERE order_number IS NULL ORDER BY created_at
    LOOP
        UPDATE orders
        SET order_number = generate_order_number()
        WHERE id = order_record.id;
    END LOOP;
END;
$$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
