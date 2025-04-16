/*
  # Add order status and improve order management

  1. Changes
    - Add status column to orders table
    - Add trigger to update inventory on order status change
    - Update existing orders with default status

  2. Security
    - Maintain existing RLS policies
*/

-- Add status enum type
CREATE TYPE order_status AS ENUM ('pending', 'picked_up', 'returned', 'cancelled');

-- Add status column to orders
ALTER TABLE orders ADD COLUMN status order_status DEFAULT 'pending';

-- Update trigger function to handle order-based inventory management
CREATE OR REPLACE FUNCTION update_inventory_on_order_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When order is marked as returned, restore inventory
  IF NEW.status = 'returned' AND OLD.status != 'returned' THEN
    UPDATE promo_items pi
    SET available_quantity = available_quantity + c.quantity
    FROM checkouts c
    WHERE c.order_id = NEW.id
    AND c.item_id = pi.id;
  -- When order is picked up, no inventory change needed
  ELSIF NEW.status = 'picked_up' AND OLD.status = 'pending' THEN
    -- No inventory change, just status update
    NULL;
  -- When order is cancelled, restore inventory if it was pending
  ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN
    UPDATE promo_items pi
    SET available_quantity = available_quantity + c.quantity
    FROM checkouts c
    WHERE c.order_id = NEW.id
    AND c.item_id = pi.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory management
CREATE TRIGGER update_inventory_on_status_change
  AFTER UPDATE OF status
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_order_status();

-- Update existing orders to have a status
UPDATE orders SET status = 'pending' WHERE status IS NULL;