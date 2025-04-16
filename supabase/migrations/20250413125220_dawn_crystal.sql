/*
  # Fix inventory quantity updates

  1. Changes
    - Simplify trigger function
    - Add better error handling
    - Fix quantity calculations
    - Add transaction safety
    
  2. Security
    - Maintains existing RLS policies
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS handle_inventory_changes ON checkouts;
DROP FUNCTION IF EXISTS handle_inventory_changes();

-- Create new function to handle inventory updates
CREATE OR REPLACE FUNCTION handle_inventory_changes()
RETURNS TRIGGER AS $$
DECLARE
  current_quantity INTEGER;
BEGIN
  -- Get current available quantity
  SELECT available_quantity INTO current_quantity
  FROM promo_items
  WHERE id = NEW.item_id
  FOR UPDATE;  -- Lock the row to prevent concurrent updates

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  -- For new checkouts
  IF (TG_OP = 'INSERT') THEN
    -- Verify we have enough inventory
    IF current_quantity < NEW.quantity THEN
      RAISE EXCEPTION 'Not enough inventory available. Requested: %, Available: %', NEW.quantity, current_quantity;
    END IF;

    -- Update available quantity
    UPDATE promo_items
    SET available_quantity = current_quantity - NEW.quantity
    WHERE id = NEW.item_id;

  -- For updates (returns/cancellations)
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.returned = true AND OLD.returned = false THEN
      -- Return items to inventory
      UPDATE promo_items
      SET available_quantity = current_quantity + NEW.quantity
      WHERE id = NEW.item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory updates
CREATE TRIGGER handle_inventory_changes
  BEFORE INSERT OR UPDATE
  ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION handle_inventory_changes();

-- Reset all inventory quantities to match actual state
DO $$
BEGIN
  -- Update all items to reset their available quantities
  UPDATE promo_items pi
  SET available_quantity = pi.total_quantity - COALESCE(
    (
      SELECT SUM(c.quantity)
      FROM checkouts c
      WHERE c.item_id = pi.id
      AND c.returned = false
    ),
    0
  );
END $$;