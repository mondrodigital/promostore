/*
  # Add sample data for testing

  1. New Data
    - Sample promotional items with images and descriptions
    - Initial quantities for inventory tracking

  2. Changes
    - Inserts promotional items into the promo_items table
*/

INSERT INTO promo_items (name, description, image_url, total_quantity, available_quantity)
VALUES
  (
    'Company Branded Hoodie',
    'Comfortable cotton-blend hoodie with embroidered company logo',
    'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=800&q=80',
    100,
    100
  ),
  (
    'Premium Water Bottle',
    'Stainless steel insulated water bottle with company branding',
    'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',
    200,
    200
  ),
  (
    'Wireless Mouse',
    'Ergonomic wireless mouse with company logo',
    'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&q=80',
    50,
    50
  ),
  (
    'Laptop Backpack',
    'Professional laptop backpack with multiple compartments',
    'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
    75,
    75
  ),
  (
    'Coffee Mug Set',
    'Set of ceramic coffee mugs with company design',
    'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=80',
    150,
    150
  ),
  (
    'Wireless Earbuds',
    'High-quality wireless earbuds in branded charging case',
    'https://images.unsplash.com/photo-1606220838315-056192d5e927?auto=format&fit=crop&w=800&q=80',
    30,
    30
  );