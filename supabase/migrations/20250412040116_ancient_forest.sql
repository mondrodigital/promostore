/*
  # Fix duplicate items and improve inventory management

  1. Changes
    - Remove duplicate items by first item created
    - Merge quantities for duplicates
    - Update checkout references
    - Add unique constraint on item names
    - Improve inventory management trigger

  2. Security
    - Maintains existing RLS policies
*/

-- First, create a temporary table to store the first occurrence of each item
CREATE TEMP TABLE keep_items AS
SELECT DISTINCT ON (name)
  id,
  name,
  description,
  image_url,
  total_quantity,
  available_quantity,
  created_at
FROM promo_items
ORDER BY name, created_at ASC;

-- Create a mapping of duplicate items to their keeper
CREATE TEMP TABLE item_mapping AS
SELECT 
  p.id as old_id,
  k.id as new_id
FROM promo_items p
LEFT JOIN keep_items k ON p.name = k.name
WHERE p.id != k.id;

-- Update checkouts to point to the kept items
UPDATE checkouts c
SET item_id = m.new_id
FROM item_mapping m
WHERE c.item_id = m.old_id;

-- Sum up quantities for duplicates
WITH quantity_sums AS (
  SELECT 
    k.id,
    SUM(p.total_quantity) as total_sum,
    SUM(p.available_quantity) as available_sum
  FROM keep_items k
  JOIN promo_items p ON p.name = k.name
  GROUP BY k.id
)
UPDATE promo_items pi
SET 
  total_quantity = qs.total_sum,
  available_quantity = qs.available_sum
FROM quantity_sums qs
WHERE pi.id = qs.id;

-- Delete duplicates
DELETE FROM promo_items
WHERE id NOT IN (SELECT id FROM keep_items);

-- Drop temporary tables
DROP TABLE keep_items;
DROP TABLE item_mapping;

-- Add unique constraint on name
ALTER TABLE promo_items ADD CONSTRAINT promo_items_name_key UNIQUE (name);

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

  -- Validate inventory quantities
  IF EXISTS (
    SELECT 1 FROM promo_items
    WHERE available_quantity < 0
  ) THEN
    RAISE EXCEPTION 'Invalid inventory update: Available quantity cannot be negative';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Inventory quantity out of range';
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