/*
  # Fix inventory update trigger

  1. Changes
    - Improve error handling in trigger function
    - Add explicit transaction handling
    - Add better validation for inventory quantities
    - Fix inventory update logic for order status changes

  2. Security
    - Maintains existing RLS policies
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_inventory_on_status_change ON orders;
DROP FUNCTION IF EXISTS update_inventory_on_order_status();

-- Create improved function to handle inventory updates based on order status
CREATE OR REPLACE FUNCTION update_inventory_on_order_status()
RETURNS TRIGGER AS $$
BEGIN
  -- For new orders (INSERT)
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    -- Verify and update inventory in a single query
    WITH inventory_check AS (
      SELECT 
        c.item_id,
        c.quantity as needed,
        pi.available_quantity as available,
        pi.name as item_name
      FROM checkouts c
      JOIN promo_items pi ON c.item_id = pi.id
      WHERE c.order_id = NEW.id
    )
    UPDATE promo_items pi
    SET available_quantity = pi.available_quantity - ic.needed
    FROM inventory_check ic
    WHERE pi.id = ic.item_id
    AND ic.available >= ic.needed
    AND pi.available_quantity >= ic.needed;

    -- Check if any items weren't updated (not enough inventory)
    IF NOT FOUND OR EXISTS (
      SELECT 1
      FROM checkouts c
      JOIN promo_items pi ON c.item_id = pi.id
      WHERE c.order_id = NEW.id
      AND pi.available_quantity < 0
    ) THEN
      -- Roll back the changes and raise an error
      RAISE EXCEPTION 'Not enough inventory available for one or more items';
    END IF;

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

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to update inventory quantities: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory management
CREATE TRIGGER update_inventory_on_status_change
  AFTER INSERT OR UPDATE OF status
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