/*
  # Add sample checkout data

  1. Changes
    - Clear existing checkouts
    - Add new sample checkouts with proper item relationships
    - Include a variety of status combinations (picked up, returned, pending)

  2. Security
    - Maintains existing RLS policies
*/

-- First, clear existing checkouts
DELETE FROM checkouts;

-- Insert new sample checkouts
WITH items AS (
  SELECT id FROM promo_items WHERE name = 'Company Branded Hoodie'
  LIMIT 1
)
INSERT INTO checkouts (
  user_name,
  user_email,
  item_id,
  quantity,
  checkout_date,
  return_date,
  picked_up,
  returned
)
SELECT
  'John Smith',
  'john.smith@example.com',
  id,
  2,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  false,
  false
FROM items;

WITH items AS (
  SELECT id FROM promo_items WHERE name = 'Premium Water Bottle'
  LIMIT 1
)
INSERT INTO checkouts (
  user_name,
  user_email,
  item_id,
  quantity,
  checkout_date,
  return_date,
  picked_up,
  returned
)
SELECT
  'Jane Doe',
  'jane.doe@example.com',
  id,
  5,
  CURRENT_DATE - INTERVAL '5 days',
  CURRENT_DATE + INTERVAL '25 days',
  true,
  false
FROM items;

WITH items AS (
  SELECT id FROM promo_items WHERE name = 'Wireless Mouse'
  LIMIT 1
)
INSERT INTO checkouts (
  user_name,
  user_email,
  item_id,
  quantity,
  checkout_date,
  return_date,
  picked_up,
  returned
)
SELECT
  'Alice Johnson',
  'alice.j@example.com',
  id,
  1,
  CURRENT_DATE - INTERVAL '10 days',
  CURRENT_DATE + INTERVAL '20 days',
  true,
  true
FROM items;