/*
  # Fix order status management and transitions

  1. Changes
    - Drop existing trigger and function
    - Create new trigger function with proper status transitions
    - Add constraints to ensure valid status values
    - Fix inventory management for all status changes

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
    -- Decrease available quantity for new pending orders
    UPDATE promo_items pi
    SET available_quantity = available_quantity - c.quantity
    FROM checkouts c
    WHERE c.order_id = NEW.id
    AND c.item_id = pi.id;
    
  -- For status updates (UPDATE)
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    -- Validate status transitions
    IF OLD.status = 'pending' AND NEW.status NOT IN ('picked_up', 'cancelled') THEN
      RAISE EXCEPTION 'Invalid status transition from pending to %', NEW.status;
    ELSIF OLD.status = 'picked_up' AND NEW.status != 'returned' THEN
      RAISE EXCEPTION 'Invalid status transition from picked_up to %', NEW.status;
    ELSIF OLD.status IN ('returned', 'cancelled') THEN
      RAISE EXCEPTION 'Cannot change status once order is % to %', OLD.status, NEW.status;
    END IF;

    -- Handle inventory updates
    CASE
      -- When cancelling a pending order, restore inventory
      WHEN OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
        UPDATE promo_items pi
        SET available_quantity = available_quantity + c.quantity
        FROM checkouts c
        WHERE c.order_id = NEW.id
        AND c.item_id = pi.id;
        
      -- When returning items, restore inventory
      WHEN OLD.status = 'picked_up' AND NEW.status = 'returned' THEN
        UPDATE promo_items pi
        SET available_quantity = available_quantity + c.quantity
        FROM checkouts c
        WHERE c.order_id = NEW.id
        AND c.item_id = pi.id;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory management
CREATE TRIGGER update_inventory_on_status_change
  AFTER INSERT OR UPDATE OF status
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_order_status();

-- Add constraint to ensure valid status values
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'picked_up', 'returned', 'cancelled'));