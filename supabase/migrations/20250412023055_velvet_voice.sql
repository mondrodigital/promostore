/*
  # Fix order status management

  1. Changes
    - Drop existing trigger and function
    - Create new trigger function with proper status transitions
    - Fix inventory management logic
    - Add proper validation for status changes

  2. Security
    - Maintains existing RLS policies
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS update_inventory_on_status_change ON orders;
DROP FUNCTION IF EXISTS update_inventory_on_order_status();
DROP FUNCTION IF EXISTS validate_status_transition();

-- Create function to validate status transitions
CREATE OR REPLACE FUNCTION validate_status_transition(old_status order_status, new_status order_status)
RETURNS boolean AS $$
BEGIN
  -- Allow same status
  IF old_status = new_status THEN
    RETURN true;
  END IF;

  -- Define valid transitions
  RETURN CASE
    -- From pending
    WHEN old_status = 'pending' AND new_status IN ('picked_up', 'cancelled') THEN true
    -- From picked_up
    WHEN old_status = 'picked_up' AND new_status = 'returned' THEN true
    -- No transitions allowed from terminal states
    WHEN old_status IN ('returned', 'cancelled') THEN false
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql;

-- Create improved function to handle inventory updates based on order status
CREATE OR REPLACE FUNCTION update_inventory_on_order_status()
RETURNS TRIGGER AS $$
DECLARE
  _old_status order_status;
BEGIN
  -- Handle both INSERT and UPDATE cases
  IF TG_OP = 'INSERT' THEN
    _old_status := NULL;
  ELSE
    _old_status := OLD.status;
  END IF;

  -- Skip if status hasn't changed
  IF _old_status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Validate status transition for updates
  IF TG_OP = 'UPDATE' THEN
    IF NOT validate_status_transition(_old_status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid status transition from % to %', _old_status, NEW.status;
    END IF;
  END IF;

  -- Handle different status transitions
  CASE
    -- New pending order
    WHEN _old_status IS NULL AND NEW.status = 'pending' THEN
      UPDATE promo_items pi
      SET available_quantity = available_quantity - c.quantity
      FROM checkouts c
      WHERE c.order_id = NEW.id
      AND c.item_id = pi.id;

    -- Cancel pending order
    WHEN _old_status = 'pending' AND NEW.status = 'cancelled' THEN
      UPDATE promo_items pi
      SET available_quantity = available_quantity + c.quantity
      FROM checkouts c
      WHERE c.order_id = NEW.id
      AND c.item_id = pi.id;

    -- Return picked up items
    WHEN _old_status = 'picked_up' AND NEW.status = 'returned' THEN
      UPDATE promo_items pi
      SET available_quantity = available_quantity + c.quantity
      FROM checkouts c
      WHERE c.order_id = NEW.id
      AND c.item_id = pi.id;

    ELSE
      -- Other transitions don't affect inventory
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