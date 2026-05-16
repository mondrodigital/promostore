-- Migration: ensure every order always has an order_number
-- Builds on the function/trigger introduced in 20250714000004_add_order_numbers.sql
-- and adds: 4-digit sequence, backfill, and NOT NULL constraint.

-- Recreate the generator with a wider sequence pad (3→4 digits, handles ≤9 999 orders/year)
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year_part   TEXT;
  v_sequence    INT;
  v_order_number TEXT;
  v_pattern     TEXT;
BEGIN
  v_year_part := TO_CHAR(CURRENT_DATE, 'YY');
  v_pattern   := '^VEL' || v_year_part || '[0-9]{4}$';

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

  v_order_number := 'VEL' || v_year_part || LPAD(v_sequence::TEXT, 4, '0');
  RETURN v_order_number;
END;
$$;

-- Recreate the trigger function (idempotent)
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

-- Recreate the trigger (idempotent)
DROP TRIGGER IF EXISTS trigger_set_order_number ON orders;
CREATE TRIGGER trigger_set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();

-- Backfill any rows that are still NULL (ordered by created_at for a stable sequence)
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

-- Now that every row has a value, enforce NOT NULL
ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;

-- Unique index (CREATE INDEX IF NOT EXISTS is idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
