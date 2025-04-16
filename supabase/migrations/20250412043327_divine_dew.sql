/*
  # Fix inventory tracking and remove duplicates

  1. Changes
    - Reset inventory quantities based on actual orders
    - Remove duplicate items while preserving relationships
    - Improve inventory tracking trigger
    - Add validation to prevent negative quantities

  2. Security
    - Maintains existing RLS policies
*/

-- First, drop the existing constraint if it exists
ALTER TABLE promo_items DROP CONSTRAINT IF EXISTS promo_items_name_key;

-- Create a temporary table to store unique items
CREATE TEMP TABLE unique_items AS
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

-- Update checkouts to point to the correct items
WITH item_mapping AS (
  SELECT 
    p.id as old_id,
    u.id as new_id
  FROM promo_items p
  JOIN unique_items u ON p.name = u.name
  WHERE p.id != u.id
)
UPDATE checkouts c
SET item_id = m.new_id
FROM item_mapping m
WHERE c.item_id = m.old_id;

-- Combine quantities for duplicate items
WITH quantity_sums AS (
  SELECT 
    u.id,
    SUM(p.total_quantity) as total_sum
  FROM unique_items u
  JOIN promo_items p ON p.name = u.name
  GROUP BY u.id
)
UPDATE promo_items pi
SET total_quantity = qs.total_sum
FROM quantity_sums qs
WHERE pi.id = qs.id;

-- Delete duplicate items
DELETE FROM promo_items
WHERE id NOT IN (SELECT id FROM unique_items);

-- Drop temporary table
DROP TABLE unique_items;

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
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory management
CREATE TRIGGER update_inventory_on_status_change
  AFTER INSERT OR UPDATE OF status
  ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_order_status();

-- Reset all inventory quantities based on actual orders
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