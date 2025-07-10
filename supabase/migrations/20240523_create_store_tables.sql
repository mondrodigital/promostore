-- Store Items Table
CREATE TABLE IF NOT EXISTS store_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price NUMERIC(10,2) NOT NULL,
  sizes TEXT[],
  colors TEXT[],
  available_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Store Orders Table
CREATE TABLE IF NOT EXISTS store_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Store Order Items Table
CREATE TABLE IF NOT EXISTS store_order_items (
  id SERIAL PRIMARY KEY,
  order_id UUID REFERENCES store_orders(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES store_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  size TEXT,
  color TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_store_order_items_order_id ON store_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_store_order_items_item_id ON store_order_items(item_id); 