/*
  # Fix database schema and constraints

  1. Changes
    - Ensure proper order of table creation
    - Fix foreign key constraints
    - Add better error handling
    - Add proper cascading deletes
*/

-- First drop existing triggers
DROP TRIGGER IF EXISTS handle_inventory_changes ON checkouts;
DROP TRIGGER IF EXISTS log_checkout_operations ON checkouts;
DROP TRIGGER IF EXISTS update_checkouts_updated_at ON checkouts;

-- Drop existing functions
DROP FUNCTION IF EXISTS handle_inventory_changes();
DROP FUNCTION IF EXISTS log_checkout_operation();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop existing tables in correct order
DROP TABLE IF EXISTS checkout_logs CASCADE;
DROP TABLE IF EXISTS checkouts CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS promo_items CASCADE;

-- Create promo_items table first
CREATE TABLE promo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  image_url text,
  total_quantity integer NOT NULL CHECK (total_quantity >= 0),
  available_quantity integer NOT NULL CHECK (available_quantity >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT quantity_check CHECK (available_quantity <= total_quantity)
);

-- Create orders table
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  user_email text NOT NULL,
  checkout_date date NOT NULL,
  return_date date NOT NULL,
  status order_status DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_dates CHECK (return_date > checkout_date)
);

-- Create checkouts table with proper references
CREATE TABLE checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES promo_items(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  returned boolean DEFAULT false,
  picked_up boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create checkout logs table
CREATE TABLE checkout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  checkout_data jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to log checkout operations
CREATE OR REPLACE FUNCTION log_checkout_operation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO checkout_logs (operation, checkout_data)
  VALUES (
    TG_OP,
    row_to_json(NEW.*)::jsonb
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO checkout_logs (operation, error_message)
    VALUES (TG_OP, SQLERRM);
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create function to handle inventory changes
CREATE OR REPLACE FUNCTION handle_inventory_changes()
RETURNS TRIGGER AS $$
DECLARE
  current_quantity INTEGER;
BEGIN
  -- Get current available quantity with row lock
  SELECT available_quantity INTO current_quantity
  FROM promo_items
  WHERE id = NEW.item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item with ID % not found', NEW.item_id;
  END IF;

  -- For new checkouts
  IF (TG_OP = 'INSERT') THEN
    IF current_quantity < NEW.quantity THEN
      RAISE EXCEPTION 'Not enough inventory available for item %. Requested: %, Available: %',
        NEW.item_id, NEW.quantity, current_quantity;
    END IF;

    -- Update available quantity
    UPDATE promo_items
    SET 
      available_quantity = current_quantity - NEW.quantity,
      updated_at = now()
    WHERE id = NEW.item_id;

  -- For updates (returns)
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.returned = true AND OLD.returned = false THEN
      -- Return items to inventory
      UPDATE promo_items
      SET 
        available_quantity = current_quantity + NEW.quantity,
        updated_at = now()
      WHERE id = NEW.item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
CREATE TRIGGER update_checkouts_updated_at
  BEFORE UPDATE ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER log_checkout_operations
  AFTER INSERT OR UPDATE OR DELETE ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION log_checkout_operation();

CREATE TRIGGER handle_inventory_changes
  BEFORE INSERT OR UPDATE ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION handle_inventory_changes();

-- Enable RLS
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Public can view promo items"
  ON promo_items FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can view orders"
  ON orders FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create orders"
  ON orders FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can view checkouts"
  ON checkouts FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create checkouts"
  ON checkouts FOR INSERT
  TO public
  WITH CHECK (true);

-- Insert sample items
INSERT INTO promo_items (id, name, description, image_url, total_quantity, available_quantity) VALUES
  (
    'c78711a8-3616-4f35-bb40-d6a0ecd09882',
    '10x10 Event Tent',
    'Professional-grade pop-up tent perfect for outdoor events. Includes carrying case.',
    'https://images.unsplash.com/photo-1595201832137-8b42646c97b1?auto=format&fit=crop&w=800&q=80',
    10,
    10
  );

-- Verify setup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM promo_items WHERE id = 'c78711a8-3616-4f35-bb40-d6a0ecd09882'
  ) THEN
    RAISE EXCEPTION 'Failed to set up database schema';
  END IF;
END $$;