-- First, remove existing checkouts and orders
DELETE FROM checkouts;
DELETE FROM orders;

-- Then remove existing items
DELETE FROM promo_items;

-- Insert new items with fixed UUIDs
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
    '3b9d3b9d-3b9d-4b9d-8b9d-3b9d3b9d3b9d',
    '8ft Rectangle Tablecloth',
    'Black polyester tablecloth for 8ft rectangular tables. Wrinkle-resistant fabric.',
    'https://images.unsplash.com/photo-1606744888344-493238951221?auto=format&fit=crop&w=800&q=80',
    30,
    30
  ),
  (
    '4c9d4c9d-4c9d-4c9d-9c9d-4c9d4c9d4c9d',
    'Retractable Banner Stand',
    '33" x 81" retractable banner stand with carrying case. Professional grade aluminum.',
    'https://images.unsplash.com/photo-1586980368323-8ce5d3d3b957?auto=format&fit=crop&w=800&q=80',
    25,
    25
  ),
  (
    '5e9d5e9d-5e9d-5e9d-ae9d-5e9d5e9d5e9d',
    'Round Cocktail Table',
    '30" diameter cocktail table, perfect for networking events. 42" height.',
    'https://images.unsplash.com/photo-1595201832137-8b42646c97b1?auto=format&fit=crop&w=800&q=80',
    20,
    20
  ),
  (
    '6f9d6f9d-6f9d-6f9d-bf9d-6f9d6f9d6f9d',
    'Folding Chair',
    'Black padded folding chair. Comfortable seating for extended periods.',
    'https://images.unsplash.com/photo-1581539250439-c96689b516dd?auto=format&fit=crop&w=800&q=80',
    100,
    100
  ),
  (
    '7a9d7a9d-7a9d-7a9d-ca9d-7a9d7a9d7a9d',
    'Literature Stand',
    'Portable literature display stand with 6 pockets. Includes carrying case.',
    'https://images.unsplash.com/photo-1586980368323-8ce5d3d3b957?auto=format&fit=crop&w=800&q=80',
    15,
    15
  ),
  (
    '8b9d8b9d-8b9d-8b9d-db9d-8b9d8b9d8b9d',
    'Table Runner',
    '14" x 108" black table runner with company logo. Premium polyester fabric.',
    'https://images.unsplash.com/photo-1606744888344-493238951221?auto=format&fit=crop&w=800&q=80',
    40,
    40
  ),
  (
    '9c9d9c9d-9c9d-9c9d-ec9d-9c9d9c9d9c9d',
    'Display Counter',
    'Portable display counter with internal shelf and graphic panel. Includes wheeled case.',
    'https://images.unsplash.com/photo-1586980368323-8ce5d3d3b957?auto=format&fit=crop&w=800&q=80',
    8,
    8
  ),
  (
    '1d9d1d9d-1d9d-1d9d-fd9d-1d9d1d9d1d9d',
    '20x20 Event Tent',
    'Large format event tent with sidewalls. Professional grade with heavy-duty frame.',
    'https://images.unsplash.com/photo-1595201832137-8b42646c97b1?auto=format&fit=crop&w=800&q=80',
    5,
    5
  );

-- Verify the items were inserted correctly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM promo_items WHERE id = 'c78711a8-3616-4f35-bb40-d6a0ecd09882'
  ) THEN
    RAISE EXCEPTION 'Failed to insert items with fixed IDs';
  END IF;
END $$;