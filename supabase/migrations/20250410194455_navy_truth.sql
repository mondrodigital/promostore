/*
  # Add sample orders with multiple items

  1. Changes
    - Clear existing orders and checkouts
    - Add new sample orders with multiple items per order
    - Include various status combinations

  2. Security
    - Maintains existing RLS policies
*/

-- First, clear existing data
DELETE FROM checkouts;
DELETE FROM orders;

-- Create some sample orders with multiple items
WITH order1 AS (
  INSERT INTO orders (
    user_name,
    user_email,
    checkout_date,
    return_date,
    status
  ) VALUES (
    'John Smith',
    'john.smith@example.com',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    'pending'
  ) RETURNING id
), items AS (
  SELECT id, name FROM promo_items
)
INSERT INTO checkouts (
  order_id,
  item_id,
  quantity
)
SELECT 
  (SELECT id FROM order1),
  id,
  CASE 
    WHEN name = 'Company Branded Hoodie' THEN 2
    WHEN name = 'Premium Water Bottle' THEN 5
    WHEN name = 'Coffee Mug Set' THEN 3
  END
FROM items
WHERE name IN ('Company Branded Hoodie', 'Premium Water Bottle', 'Coffee Mug Set');

-- Create another order with different items
WITH order2 AS (
  INSERT INTO orders (
    user_name,
    user_email,
    checkout_date,
    return_date,
    status
  ) VALUES (
    'Sarah Johnson',
    'sarah.j@example.com',
    CURRENT_DATE - INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '25 days',
    'picked_up'
  ) RETURNING id
), items AS (
  SELECT id, name FROM promo_items
)
INSERT INTO checkouts (
  order_id,
  item_id,
  quantity
)
SELECT 
  (SELECT id FROM order2),
  id,
  CASE 
    WHEN name = 'Wireless Mouse' THEN 1
    WHEN name = 'Laptop Backpack' THEN 2
    WHEN name = 'Wireless Earbuds' THEN 1
  END
FROM items
WHERE name IN ('Wireless Mouse', 'Laptop Backpack', 'Wireless Earbuds');

-- Create a returned order
WITH order3 AS (
  INSERT INTO orders (
    user_name,
    user_email,
    checkout_date,
    return_date,
    status
  ) VALUES (
    'Michael Chen',
    'michael.c@example.com',
    CURRENT_DATE - INTERVAL '15 days',
    CURRENT_DATE - INTERVAL '1 day',
    'returned'
  ) RETURNING id
), items AS (
  SELECT id, name FROM promo_items
)
INSERT INTO checkouts (
  order_id,
  item_id,
  quantity
)
SELECT 
  (SELECT id FROM order3),
  id,
  CASE 
    WHEN name = 'Company Branded Hoodie' THEN 3
    WHEN name = 'Premium Water Bottle' THEN 10
  END
FROM items
WHERE name IN ('Company Branded Hoodie', 'Premium Water Bottle');