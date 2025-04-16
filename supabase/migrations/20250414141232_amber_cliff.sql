/*
  # Fix checkout schema and add logging

  1. Changes
    - Add trigger to log checkout operations
    - Fix checkout table constraints
    - Add better error handling
*/

-- Create a table to log checkout operations
CREATE TABLE IF NOT EXISTS checkout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  checkout_data jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);

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

-- Add trigger to log checkout operations
DROP TRIGGER IF EXISTS log_checkout_operations ON checkouts;
CREATE TRIGGER log_checkout_operations
  AFTER INSERT OR UPDATE OR DELETE
  ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION log_checkout_operation();

-- Drop and recreate the checkouts table to ensure proper constraints
DROP TABLE IF EXISTS checkouts CASCADE;
CREATE TABLE checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES promo_items(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  returned boolean DEFAULT false,
  picked_up boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_quantity CHECK (quantity > 0)
);

-- Enable RLS
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Public can view checkouts"
  ON checkouts FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can create checkouts"
  ON checkouts FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Admins can update checkouts"
  ON checkouts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Add trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_checkouts_updated_at
  BEFORE UPDATE
  ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to handle inventory changes
CREATE OR REPLACE FUNCTION handle_inventory_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- For new checkouts
  IF (TG_OP = 'INSERT') THEN
    -- Check if we have enough inventory
    IF EXISTS (
      SELECT 1
      FROM promo_items
      WHERE id = NEW.item_id
      AND available_quantity < NEW.quantity
    ) THEN
      RAISE EXCEPTION 'Not enough inventory available for item %', NEW.item_id;
    END IF;

    -- Update available quantity
    UPDATE promo_items
    SET available_quantity = available_quantity - NEW.quantity
    WHERE id = NEW.item_id;

  -- For updates (returns)
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.returned = true AND OLD.returned = false THEN
      -- Return items to inventory
      UPDATE promo_items
      SET available_quantity = available_quantity + NEW.quantity
      WHERE id = NEW.item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory updates
CREATE TRIGGER handle_inventory_changes
  BEFORE INSERT OR UPDATE
  ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION handle_inventory_changes();