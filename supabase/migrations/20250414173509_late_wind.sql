-- Drop existing schema
DROP TABLE IF EXISTS checkouts CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS promo_items CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;

-- Create enum type for order status
CREATE TYPE order_status AS ENUM ('pending', 'picked_up', 'returned', 'cancelled');

-- Create tables
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

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL,
  user_email text NOT NULL,
  checkout_date date NOT NULL,
  return_date date NOT NULL,
  status order_status DEFAULT 'pending',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_dates CHECK (return_date > checkout_date)
);

-- Enable RLS
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

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

-- Insert sample items
INSERT INTO promo_items (name, description, image_url, total_quantity, available_quantity) VALUES
  (
    'Digital Display Stand',
    '55" 4K display with adjustable stand, perfect for presentations and digital signage.',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&q=80',
    5,
    5
  ),
  (
    'Event Backdrop Kit',
    'Professional 8x10ft backdrop with adjustable frame and LED lighting.',
    'https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=800&q=80',
    8,
    8
  ),
  (
    'Mobile Stage Platform',
    'Portable 4x4ft stage platform with adjustable height and safety rails.',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80',
    3,
    3
  ),
  (
    'Pro Audio Package',
    'Complete audio system with speakers, mixer, and wireless microphones.',
    'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?auto=format&fit=crop&w=800&q=80',
    4,
    4
  ),
  (
    'Event Lighting Kit',
    'Professional LED lighting package with controller and mounting hardware.',
    'https://images.unsplash.com/photo-1504501650895-2441b7915699?auto=format&fit=crop&w=800&q=80',
    6,
    6
  );