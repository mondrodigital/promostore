/*
  # Add sample checkout data

  1. Changes
    - Clear existing checkouts to start fresh
    - Add new sample checkouts with different statuses and dates
    - Include a mix of picked up, returned, and pending items

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
  CURRENT_DATE - INTERVAL '2 days',
  CURRENT_DATE + INTERVAL '28 days',
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
  CURRENT_DATE - INTERVAL '10 days',
  CURRENT_DATE - INTERVAL '5 days',
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
  CURRENT_DATE - INTERVAL '15 days',
  CURRENT_DATE - INTERVAL '1 day',
  true,
  true
FROM items;

WITH items AS (
  SELECT id FROM promo_items WHERE name = 'Coffee Mug Set'
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
  'Bob Wilson',
  'bob.w@example.com',
  id,
  3,
  CURRENT_DATE + INTERVAL '1 day',
  CURRENT_DATE + INTERVAL '30 days',
  false,
  false
FROM items;

WITH items AS (
  SELECT id FROM promo_items WHERE name = 'Laptop Backpack'
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
  'Emma Davis',
  'emma.d@example.com',
  id,
  2,
  CURRENT_DATE - INTERVAL '5 days',
  CURRENT_DATE + INTERVAL '25 days',
  true,
  false
FROM items;