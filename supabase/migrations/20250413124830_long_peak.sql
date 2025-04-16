/*
  # Fix inventory checkout process

  1. Changes
    - Simplify inventory update logic
    - Remove complex transaction handling
    - Add direct quantity updates
    - Add better validation
    
  2. Security
    - Maintains existing RLS policies
*/

-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS update_inventory ON checkouts;
DROP TRIGGER IF EXISTS update_inventory_on_status_change ON orders;
DROP FUNCTION IF EXISTS update_available_quantity();
DROP FUNCTION IF EXISTS update_inventory_on_order_status();

-- Create new function to handle inventory updates
CREATE OR REPLACE FUNCTION handle_inventory_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- For new orders
  IF (TG_OP = 'INSERT') THEN
    -- Check if we have enough inventory
    IF EXISTS (
      SELECT 1
      FROM promo_items
      WHERE id = NEW.item_id
      AND available_quantity < NEW.quantity
    ) THEN
      RAISE EXCEPTION 'Not enough inventory available for item %', NEW.item_id;
    END IF;

    -- Update available quantity
    UPDATE promo_items
    SET available_quantity = available_quantity - NEW.quantity
    WHERE id = NEW.item_id;
  END IF;

  -- For order status changes
  IF (TG_OP = 'UPDATE') THEN
    -- If order is cancelled or returned, restore inventory
    IF NEW.returned = true AND OLD.returned = false THEN
      UPDATE promo_items
      SET available_quantity = available_quantity + NEW.quantity
      WHERE id = NEW.item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory updates
CREATE TRIGGER handle_inventory_changes
  AFTER INSERT OR UPDATE
  ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION handle_inventory_changes();

-- Reset all inventory quantities to match actual state
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