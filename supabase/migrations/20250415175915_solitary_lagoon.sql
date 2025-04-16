-- Disable RLS completely for all tables
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Anyone can do anything" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;
DROP POLICY IF EXISTS "Anyone can manage promo items" ON promo_items;

-- Grant all permissions to all roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Reset all sequences
ALTER SEQUENCE IF EXISTS promo_items_id_seq RESTART;
ALTER SEQUENCE IF EXISTS orders_id_seq RESTART;
ALTER SEQUENCE IF EXISTS checkouts_id_seq RESTART;

-- Clear existing data
TRUNCATE promo_items CASCADE;

-- Insert fresh sample data
INSERT INTO promo_items (name, description, image_url, total_quantity, available_quantity) VALUES
  (
    'Premium LED Display',
    '55" 4K LED display with floor stand. Perfect for digital signage and presentations.',
    'https://images.unsplash.com/photo-1542393545-10f5cde2c810?auto=format&fit=crop&w=800&q=80',
    10,
    10
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
    'Conference Audio System',
    'High-end audio package including wireless microphones and line array speakers.',
    'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?auto=format&fit=crop&w=800&q=80',
    5,
    5
  ),
  (
    'Event Lighting Package',
    'Professional LED lighting kit with moving heads, wash lights, and DMX controller.',
    'https://images.unsplash.com/photo-1504501650895-2441b7915699?auto=format&fit=crop&w=800&q=80',
    6,
    6
  );