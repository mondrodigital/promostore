/*
  # Fix inventory update trigger

  1. Changes
    - Improve inventory validation before updates
    - Add better error messages for inventory issues
    - Fix transaction handling for inventory updates

  2. Security
    - Maintains existing RLS policies
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_inventory_on_status_change ON orders;
DROP FUNCTION IF EXISTS update_inventory_on_order_status();

-- Create improved function to handle inventory updates based on order status
CREATE OR REPLACE FUNCTION update_inventory_on_order_status()
RETURNS TRIGGER AS $$
DECLARE
  insufficient_items TEXT[];
  item_record RECORD;
BEGIN
  -- For new orders (INSERT)
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    -- Check inventory availability first
    FOR item_record IN
      SELECT 
        pi.name,
        c.quantity as needed,
        pi.available_quantity as available
      FROM checkouts c
      JOIN promo_items pi ON c.item_id = pi.id
      WHERE c.order_id = NEW.id
      AND c.quantity > pi.available_quantity
    LOOP
      insufficient_items := array_append(
        insufficient_items, 
        format('%s (Requested: %s, Available: %s)', 
          item_record.name, 
          item_record.needed, 
          item_record.available
        )
      );
    END LOOP;

    -- If any items have insufficient quantity, raise detailed error
    IF insufficient_items IS NOT NULL THEN
      RAISE EXCEPTION 'Not enough inventory available for the following items:%', E'\n' || array_to_string(insufficient_items, E'\n');
    END IF;

    -- If we have enough inventory, update quantities
    UPDATE promo_items pi
    SET available_quantity = pi.available_quantity - c.quantity
    FROM checkouts c
    WHERE c.order_id = NEW.id
    AND c.item_id = pi.id;

  -- For status updates (UPDATE)
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    CASE
      -- When cancelling a pending order, restore inventory
      WHEN OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
        UPDATE promo_items pi
        SET available_quantity = pi.available_quantity + c.quantity
        FROM checkouts c
        WHERE c.order_id = NEW.id
        AND c.item_id = pi.id;

      -- When returning items, restore inventory
      WHEN OLD.status = 'picked_up' AND NEW.status = 'returned' THEN
        UPDATE promo_items pi
        SET available_quantity = pi.available_quantity + c.quantity
        FROM checkouts c
        WHERE c.order_id = NEW.id
        AND c.item_id = pi.id;
    END CASE;
  END IF;

  -- Final validation
  IF EXISTS (
    SELECT 1 FROM promo_items
    WHERE available_quantity < 0
  ) THEN
    RAISE EXCEPTION 'Invalid inventory update: Available quantity cannot be negative';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory management
CREATE TRIGGER update_inventory_on_status_change
  BEFORE INSERT OR UPDATE OF status
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_order_status();

-- Reset inventory quantities to match actual state
WITH order_quantities AS (
  SELECT 
    c.item_id,
    SUM(CASE 
      WHEN o.status IN ('pending', 'picked_up') THEN c.quantity 
      ELSE 0 
    END) as checked_out_quantity
  FROM checkouts c
  JOIN orders o ON c.order_id = o.id
  GROUP BY c.item_id
)
UPDATE promo_items pi
SET available_quantity = pi.total_quantity - COALESCE(
  (SELECT checked_out_quantity FROM order_quantities WHERE item_id = pi.id),
  0
);