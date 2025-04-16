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
  created_at timestamptz DEFAULT now()
);

CREATE TABLE checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES promo_items(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now()
);

-- Create function to handle order creation
CREATE OR REPLACE FUNCTION create_order_with_checkouts(
  p_checkout_date text,
  p_items jsonb,
  p_return_date text,
  p_user_email text,
  p_user_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item record;
  v_checkout_date date;
  v_return_date date;
  v_item_name text;
  v_available integer;
BEGIN
  -- Convert dates
  BEGIN
    v_checkout_date := p_checkout_date::date;
    v_return_date := p_return_date::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid date format. Expected YYYY-MM-DD';
  END;

  -- Validate input
  IF p_user_name IS NULL OR p_user_name = '' THEN
    RAISE EXCEPTION 'User name is required';
  END IF;

  IF p_user_email IS NULL OR p_user_email = '' THEN
    RAISE EXCEPTION 'User email is required';
  END IF;

  IF v_return_date <= v_checkout_date THEN
    RAISE EXCEPTION 'Return date must be after checkout date';
  END IF;

  IF p_items IS NULL OR p_items = '[]'::jsonb OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Start transaction
  BEGIN
    -- First verify all items exist and have sufficient quantity
    FOR v_item IN 
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      -- Get item details and lock the row
      SELECT name, available_quantity 
      INTO v_item_name, v_available
      FROM promo_items 
      WHERE id = v_item.item_id 
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item with ID % not found', v_item.item_id;
      END IF;

      IF v_item.quantity <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for item %', v_item.quantity, v_item_name;
      END IF;

      IF v_item.quantity > v_available THEN
        RAISE EXCEPTION 'Insufficient quantity for item %. Requested: %, Available: %',
          v_item_name, v_item.quantity, v_available;
      END IF;
    END LOOP;

    -- Create order
    INSERT INTO orders (
      user_name,
      user_email,
      checkout_date,
      return_date,
      status
    ) VALUES (
      p_user_name,
      p_user_email,
      v_checkout_date,
      v_return_date,
      'pending'
    ) RETURNING id INTO v_order_id;

    -- Create checkouts and update inventory
    FOR v_item IN 
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      -- Create checkout
      INSERT INTO checkouts (
        order_id,
        item_id,
        quantity
      ) VALUES (
        v_order_id,
        v_item.item_id,
        v_item.quantity
      );

      -- Update inventory
      UPDATE promo_items
      SET 
        available_quantity = available_quantity - v_item.quantity,
        updated_at = now()
      WHERE id = v_item.item_id;
    END LOOP;

    -- Return success
    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_order_id,
      'message', 'Order created successfully'
    );

  EXCEPTION WHEN OTHERS THEN
    -- Re-raise the error with context
    RAISE EXCEPTION 'Failed to create order: %', SQLERRM;
  END;
END;
$$;

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