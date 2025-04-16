/*
  # Add orders table and update checkouts schema

  1. New Tables
    - `orders`
      - `id` (uuid, primary key)
      - `user_name` (text)
      - `user_email` (text)
      - `checkout_date` (date)
      - `return_date` (date)
      - `created_at` (timestamptz)

  2. Changes
    - Move user info from checkouts to orders table
    - Add order_id to checkouts table
    - Update constraints and foreign keys
    - Update RLS policies

  3. Security
    - Enable RLS on orders table
    - Add appropriate policies
*/

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  user_email text NOT NULL,
  checkout_date date NOT NULL,
  return_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Add order_id to checkouts
ALTER TABLE checkouts ADD COLUMN order_id uuid REFERENCES orders(id);

-- Move existing checkouts to orders
WITH distinct_orders AS (
  SELECT DISTINCT
    user_name,
    user_email,
    checkout_date,
    return_date,
    created_at
  FROM checkouts
  WHERE user_name IS NOT NULL
    AND user_email IS NOT NULL
)
INSERT INTO orders (
  user_name,
  user_email,
  checkout_date,
  return_date,
  created_at
)
SELECT
  user_name,
  user_email,
  checkout_date,
  return_date,
  created_at
FROM distinct_orders;

-- Update checkouts with order_id
UPDATE checkouts c
SET order_id = o.id
FROM orders o
WHERE c.user_name = o.user_name
  AND c.user_email = o.user_email
  AND c.checkout_date = o.checkout_date
  AND c.return_date = o.return_date;

-- Make order_id required
ALTER TABLE checkouts ALTER COLUMN order_id SET NOT NULL;

-- Remove redundant columns from checkouts
ALTER TABLE checkouts 
  DROP COLUMN user_name,
  DROP COLUMN user_email,
  DROP COLUMN checkout_date,
  DROP COLUMN return_date;

-- Drop old constraint
ALTER TABLE checkouts DROP CONSTRAINT IF EXISTS checkouts_user_info_check;

-- Add RLS policies for orders
CREATE POLICY "Public can view orders"
  ON orders
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create orders"
  ON orders
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Admins can update orders"
  ON orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Update trigger function to handle order-based checkouts
CREATE OR REPLACE FUNCTION update_available_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Decrease available quantity when item is checked out
    UPDATE promo_items
    SET available_quantity = available_quantity - NEW.quantity
    WHERE id = NEW.item_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.returned = true AND OLD.returned = false THEN
    -- Increase available quantity when item is returned
    UPDATE promo_items
    SET available_quantity = available_quantity + NEW.quantity
    WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;