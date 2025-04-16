/*
  # Fix inventory updates and order handling

  1. Changes
    - Improve trigger function to properly handle inventory updates
    - Add validation for inventory quantities
    - Fix order status transitions
    - Add better error handling
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
    SET available_quantity = pi.available_quantity - c.quantity
    FROM checkouts c
    WHERE c.order_id = NEW.id
    AND c.item_id = pi.id;
    
    -- Validate quantities after update
    IF EXISTS (
      SELECT 1 FROM promo_items
      WHERE available_quantity < 0
    ) THEN
      RAISE EXCEPTION 'Not enough items in inventory';
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
        
      -- When picking up items, no inventory change needed
      WHEN OLD.status = 'pending' AND NEW.status = 'picked_up' THEN
        -- No inventory changes needed
        NULL;
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
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error updating inventory: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory management
CREATE TRIGGER update_inventory_on_status_change
  AFTER INSERT OR UPDATE OF status
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_order_status();

-- Reset inventory quantities to match actual checkout state
WITH order_quantities AS (
  SELECT 
    c.item_id,
    SUM(CASE 
      WHEN o.status = 'pending' OR o.status = 'picked_up' THEN c.quantity 
      ELSE 0 
    END) as checked_out_quantity
  FROM checkouts c
  JOIN orders o ON c.order_id = o.id
  GROUP BY c.item_id
)
UPDATE promo_items pi
SET available_quantity = pi.total_quantity - COALESCE(oq.checked_out_quantity, 0)
FROM order_quantities oq
WHERE pi.id = oq.item_id;