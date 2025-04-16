-- Drop everything to start fresh
DROP TRIGGER IF EXISTS handle_inventory_changes ON checkouts;
DROP TRIGGER IF EXISTS log_checkout_operations ON checkouts;
DROP TRIGGER IF EXISTS update_checkouts_updated_at ON checkouts;
DROP TRIGGER IF EXISTS update_inventory_on_status_change ON orders;

DROP FUNCTION IF EXISTS handle_inventory_changes();
DROP FUNCTION IF EXISTS log_checkout_operation();
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS create_order_with_checkouts(text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS validate_order_items(jsonb);
DROP FUNCTION IF EXISTS update_inventory_on_order_status();

DROP TABLE IF EXISTS checkout_logs CASCADE;
DROP TABLE IF EXISTS checkouts CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS promo_items CASCADE;

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
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_dates CHECK (return_date > checkout_date)
);

CREATE TABLE checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES promo_items(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now()
);

-- Create function to process orders
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

  IF p_items IS NULL OR p_items = '[]'::jsonb THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Start transaction
  BEGIN
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

    -- Process each item
    FOR v_item IN 
      SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
    LOOP
      -- Verify and lock item
      IF NOT EXISTS (
        SELECT 1 FROM promo_items
        WHERE id = v_item.item_id
        AND available_quantity >= v_item.quantity
        FOR UPDATE
      ) THEN
        RAISE EXCEPTION 'Item % not available in requested quantity', v_item.item_id;
      END IF;

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
      SET available_quantity = available_quantity - v_item.quantity
      WHERE id = v_item.item_id;
    END LOOP;

    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_order_id,
      'message', 'Order created successfully'
    );
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
INSERT INTO promo_items (id, name, description, image_url, total_quantity, available_quantity) VALUES
  (
    'c78711a8-3616-4f35-bb40-d6a0ecd09882',
    '10x10 Event Tent',
    'Professional-grade pop-up tent perfect for outdoor events. Includes carrying case.',
    'https://images.unsplash.com/photo-1595201832137-8b42646c97b1?auto=format&fit=crop&w=800&q=80',
    10,
    10
  ),
  (
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    '6ft Rectangle Tablecloth',
    'Black polyester tablecloth for 6ft rectangular tables. Wrinkle-resistant fabric.',
    'https://images.unsplash.com/photo-1606744888344-493238951221?auto=format&fit=crop&w=800&q=80',
    50,
    50
  ),
  (
    '550e8400-e29b-41d4-a716-446655440000',
    'Retractable Banner Stand',
    '33" x 81" retractable banner stand with carrying case. Professional grade aluminum.',
    'https://images.unsplash.com/photo-1586980368323-8ce5d3d3b957?auto=format&fit=crop&w=800&q=80',
    25,
    25
  );