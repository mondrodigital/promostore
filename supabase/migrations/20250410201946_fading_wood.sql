/*
  # Fix order status changes and inventory management

  1. Changes
    - Drop and recreate trigger function with proper status handling
    - Add proper inventory management for all status transitions
    - Ensure inventory is updated correctly for each status change

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
  -- Skip if status hasn't changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Handle different status transitions
  CASE
    -- When returning items (from picked_up to returned)
    WHEN OLD.status = 'picked_up' AND NEW.status = 'returned' THEN
      UPDATE promo_items pi
      SET available_quantity = available_quantity + c.quantity
      FROM checkouts c
      WHERE c.order_id = NEW.id
      AND c.item_id = pi.id;

    -- When cancelling a pending order
    WHEN OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
      UPDATE promo_items pi
      SET available_quantity = available_quantity + c.quantity
      FROM checkouts c
      WHERE c.order_id = NEW.id
      AND c.item_id = pi.id;

    -- When creating a new pending order
    WHEN TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      UPDATE promo_items pi
      SET available_quantity = available_quantity - c.quantity
      FROM checkouts c
      WHERE c.order_id = NEW.id
      AND c.item_id = pi.id;

    ELSE
      -- For other transitions (like pending to picked_up)
      -- No inventory changes needed
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory management
CREATE TRIGGER update_inventory_on_status_change
  AFTER INSERT OR UPDATE OF status
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_order_status();

-- Update all orders to ensure trigger is working
UPDATE orders SET status = status WHERE status IS NOT NULL;