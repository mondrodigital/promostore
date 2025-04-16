/*
  # Initial Schema Setup for Promo Inventory System

  1. New Tables
    - users
      - Custom user profile data including admin status
    - promo_items
      - Inventory items with descriptions and quantities
    - checkouts
      - Tracks item checkouts and returns

  2. Security
    - Enable RLS on all tables
    - Add policies for appropriate access control
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  department text NOT NULL,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create promo_items table
CREATE TABLE IF NOT EXISTS promo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  total_quantity integer NOT NULL,
  available_quantity integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create checkouts table
CREATE TABLE IF NOT EXISTS checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  item_id uuid REFERENCES promo_items(id),
  quantity integer NOT NULL,
  checkout_date date NOT NULL,
  return_date date NOT NULL,
  returned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Promo items policies
CREATE POLICY "Anyone can view promo items"
  ON promo_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage promo items"
  ON promo_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Checkouts policies
CREATE POLICY "Users can view their own checkouts"
  ON checkouts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create checkouts"
  ON checkouts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own checkouts"
  ON checkouts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Function to update available quantity
CREATE OR REPLACE FUNCTION update_available_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE promo_items
    SET available_quantity = available_quantity - NEW.quantity
    WHERE id = NEW.item_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.returned = true AND OLD.returned = false THEN
    UPDATE promo_items
    SET available_quantity = available_quantity + NEW.quantity
    WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for managing inventory
CREATE TRIGGER update_inventory
AFTER INSERT OR UPDATE ON checkouts
FOR EACH ROW
EXECUTE FUNCTION update_available_quantity();