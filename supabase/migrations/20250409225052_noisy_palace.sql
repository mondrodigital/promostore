/*
  # Add example orders

  1. Changes
    - Add sample checkout records with various statuses
    - Include a mix of picked up, returned, and pending orders
    - Use existing promo items from previous migrations

  2. Data
    - Multiple orders with different dates and statuses
    - Various quantities and items
*/

-- Insert example checkouts
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
FROM promo_items
WHERE name = 'Company Branded Hoodie';

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
FROM promo_items
WHERE name = 'Premium Water Bottle';

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
FROM promo_items
WHERE name = 'Wireless Earbuds';

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
  'David Kim',
  'david.k@company.com',
  id,
  5,
  CURRENT_DATE - INTERVAL '2 days',
  CURRENT_DATE + INTERVAL '28 days',
  true,
  false
FROM promo_items
WHERE name = 'Coffee Mug Set';

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
  'Lisa Thompson',
  'lisa.t@company.com',
  id,
  1,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  false,
  false
FROM promo_items
WHERE name = 'Laptop Backpack';