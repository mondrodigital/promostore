/*
  # Add mock data for testing

  1. Mock Data
    - Add sample admin user through Supabase auth schema
    - Add sample promotional items with varying quantities and descriptions
    - All items include realistic Unsplash image URLs

  2. Security
    - Maintain existing RLS policies
    - Ensure data follows security constraints
*/

-- First create the user in auth.users
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES (
  'ed987654-3210-4321-8765-432109876543',
  '00000000-0000-0000-0000-000000000000',
  'admin@company.com',
  '$2a$10$5RqeMGu0NvGaRDwUzPj3Z.GAv1YYw9yVZnXkHBgD1uku7.ayGBxYi', -- This is a hashed version of 'password123'
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  false,
  'authenticated'
);

-- Then create the user in public.users
INSERT INTO public.users (id, email, full_name, department, is_admin)
VALUES (
  'ed987654-3210-4321-8765-432109876543',
  'admin@company.com',
  'Admin User',
  'IT',
  true
);

-- Insert promotional items
INSERT INTO promo_items (name, description, image_url, total_quantity, available_quantity)
VALUES
  (
    'Company Branded Hoodie',
    'Comfortable cotton-blend hoodie with embroidered company logo',
    'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=800&q=80',
    100,
    95
  ),
  (
    'Premium Water Bottle',
    'Stainless steel insulated water bottle with company branding',
    'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',
    200,
    180
  ),
  (
    'Wireless Mouse',
    'Ergonomic wireless mouse with company logo',
    'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&q=80',
    50,
    45
  ),
  (
    'Laptop Backpack',
    'Professional laptop backpack with multiple compartments',
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
    75,
    70
  ),
  (
    'Coffee Mug Set',
    'Set of ceramic coffee mugs with company design',
    'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=80',
    150,
    140
  ),
  (
    'Wireless Earbuds',
    'High-quality wireless earbuds in branded charging case',
    'https://images.unsplash.com/photo-1606220838315-056192d5e927?auto=format&fit=crop&w=800&q=80',
    30,
    25
  );

-- Insert some sample checkouts
INSERT INTO checkouts (user_id, item_id, quantity, checkout_date, return_date, returned)
SELECT
  'ed987654-3210-4321-8765-432109876543',
  id,
  5,
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE + INTERVAL '60 days',
  false
FROM promo_items
LIMIT 1;