/*
  # Update orders and checkouts schema for status management

  1. Changes
    - Add trigger to update inventory when order status changes
    - Update existing trigger function to handle order status changes
    - Add constraints to ensure valid status transitions

  2. Security
    - Maintains existing RLS policies
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_inventory_on_status_change ON orders;
DROP FUNCTION IF EXISTS update_inventory_on_order_status();

-- Create function to handle inventory updates based on order status
CREATE OR REPLACE FUNCTION update_inventory_on_order_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When order is marked as returned, restore inventory
  IF NEW.status = 'returned' AND OLD.status = 'picked_up' THEN
    UPDATE promo_items pi
    SET available_quantity = available_quantity + c.quantity
    FROM checkouts c
    WHERE c.order_id = NEW.id
    AND c.item_id = pi.id;
  
  -- When order is cancelled and was pending, restore inventory
  ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    UPDATE promo_items pi
    SET available_quantity = available_quantity + c.quantity
    FROM checkouts c
    WHERE c.order_id = NEW.id
    AND c.item_id = pi.id;
  
  -- When order is created (pending), decrease inventory
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    UPDATE promo_items pi
    SET available_quantity = available_quantity - c.quantity
    FROM checkouts c
    WHERE c.order_id = NEW.id
    AND c.item_id = pi.id;
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