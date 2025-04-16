/*
  # Add sample checkout data
  
  1. Changes
    - Clear existing checkouts
    - Insert new sample checkouts with verified item relationships
    - Ensure proper date handling for checkout periods
    
  2. Security
    - Maintains existing RLS policies
    - No changes to security settings
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
  'John Smith',
  'john.smith@example.com',
  id,
  2,
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  false,
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
  'Jane Doe',
  'jane.doe@example.com',
  id,
  5,
  CURRENT_DATE - INTERVAL '5 days',
  CURRENT_DATE + INTERVAL '25 days',
  true,
  false
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
  'Alice Johnson',
  'alice.j@example.com',
  id,
  1,
  CURRENT_DATE - INTERVAL '10 days',
  CURRENT_DATE + INTERVAL '20 days',
  true,
  false
FROM items
WHERE name = 'Wireless Mouse';