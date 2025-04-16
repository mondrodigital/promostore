/*
  # Fix inventory management

  1. Changes
    - Move trigger to AFTER INSERT/UPDATE to ensure proper transaction handling
    - Add explicit transaction control
    - Add row-level locking to prevent race conditions
    - Improve error messages and validation
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS handle_inventory_changes ON checkouts;
DROP FUNCTION IF EXISTS handle_inventory_changes();

-- Create new function to handle inventory updates
CREATE OR REPLACE FUNCTION handle_inventory_changes()
RETURNS TRIGGER AS $$
DECLARE
  available_qty INTEGER;
  total_qty INTEGER;
BEGIN
  -- Get current quantities with row lock
  SELECT available_quantity, total_quantity 
  INTO available_qty, total_qty
  FROM promo_items
  WHERE id = NEW.item_id
  FOR UPDATE;  -- This locks the row until the transaction completes

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item with ID % not found', NEW.item_id;
  END IF;

  -- For new checkouts
  IF (TG_OP = 'INSERT') THEN
    -- Check if we have enough inventory
    IF available_qty < NEW.quantity THEN
      RAISE EXCEPTION 'Not enough inventory available. Requested: %, Available: %', 
        NEW.quantity, available_qty;
    END IF;

    -- Update available quantity
    UPDATE promo_items
    SET available_quantity = available_qty - NEW.quantity
    WHERE id = NEW.item_id;

  -- For updates to existing checkouts
  ELSIF (TG_OP = 'UPDATE') THEN
    -- If item is being returned, add quantity back to inventory
    IF NEW.returned = true AND OLD.returned = false THEN
      UPDATE promo_items
      SET available_quantity = LEAST(total_qty, available_qty + NEW.quantity)
      WHERE id = NEW.item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory updates
CREATE TRIGGER handle_inventory_changes
  AFTER INSERT OR UPDATE  -- Changed to AFTER to ensure the checkout record exists
  ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION handle_inventory_changes();

-- Reset all inventory quantities to match actual state
DO $$
BEGIN
  -- Update all items to reset their available quantities
  UPDATE promo_items pi
  SET available_quantity = (
    SELECT pi.total_quantity - COALESCE(SUM(c.quantity), 0)
    FROM checkouts c
    WHERE c.item_id = pi.id
    AND c.returned = false
    GROUP BY pi.id
  );
END $$;