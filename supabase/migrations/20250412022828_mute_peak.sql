/*
  # Fix order status management and inventory updates

  1. Changes
    - Drop existing trigger and function
    - Create new trigger function with proper status transitions
    - Add validation for status changes
    - Fix inventory management logic

  2. Security
    - Maintains existing RLS policies
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_inventory_on_status_change ON orders;
DROP FUNCTION IF EXISTS update_inventory_on_order_status();

-- Create function to validate status transitions
CREATE OR REPLACE FUNCTION validate_status_transition(old_status order_status, new_status order_status)
RETURNS boolean AS $$
BEGIN
  RETURN CASE
    WHEN old_status = 'pending' AND new_status IN ('picked_up', 'cancelled') THEN true
    WHEN old_status = 'picked_up' AND new_status = 'returned' THEN true
    WHEN old_status = new_status THEN true
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql;

-- Create improved function to handle inventory updates based on order status
CREATE OR REPLACE FUNCTION update_inventory_on_order_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate status transition
  IF NOT validate_status_transition(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
  END IF;

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