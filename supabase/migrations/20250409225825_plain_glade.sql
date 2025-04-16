/*
  # Fix checkout relationships and add more sample data

  1. Changes
    - Clear existing checkouts
    - Insert new sample checkouts with correct relationships
    - Ensure foreign key constraints are properly maintained
*/

-- First, clear existing checkouts to start fresh
DELETE FROM checkouts;

-- Insert new sample checkouts with verified item relationships
WITH items AS (
  SELECT id, name FROM promo_items
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
  'Sarah Johnson',
  'sarah.j@company.com',
  id,
  3,
  CURRENT_DATE - INTERVAL '5 days',
  CURRENT_DATE + INTERVAL '25 days',
  true,
  false
FROM items
WHERE name = 'Company Branded Hoodie';

WITH items AS (
  SELECT id, name FROM promo_items
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
  'Michael Chen',
  'michael.c@company.com',
  id,
  10,
  CURRENT_DATE - INTERVAL '15 days',
  CURRENT_DATE - INTERVAL '5 days',
  true,
  true
FROM items
WHERE name = 'Premium Water Bottle';

WITH items AS (
  SELECT id, name FROM promo_items
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
  'Emily Rodriguez',
  'emily.r@company.com',
  id,
  2,
  CURRENT_DATE + INTERVAL '2 days',
  CURRENT_DATE + INTERVAL '32 days',
  false,
  false
FROM items
WHERE name = 'Wireless Earbuds';