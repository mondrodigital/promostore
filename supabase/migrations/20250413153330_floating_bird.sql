/*
  # Reset Promo Items

  1. Changes
    - Safely remove existing items and their references
    - Add new event-related items with proper quantities
    
  2. New Items
    - Table cloths (various sizes)
    - Pop-up banners
    - Event tents
    - Display stands
    - Event chairs
    - Portable tables
*/

-- First, remove existing checkouts and their references
DELETE FROM checkouts;

-- Then remove existing items
DELETE FROM promo_items;

-- Insert new event-related items
INSERT INTO promo_items (id, name, description, image_url, total_quantity, available_quantity) VALUES
  (
    gen_random_uuid(),
    '10x10 Event Tent',
    'Professional-grade pop-up tent perfect for outdoor events. Includes carrying case.',
    'https://images.unsplash.com/photo-1595201832137-8b42646c97b1?auto=format&fit=crop&w=800&q=80',
    10,
    10
  ),
  (
    gen_random_uuid(),
    '6ft Rectangle Tablecloth',
    'Black polyester tablecloth for 6ft rectangular tables. Wrinkle-resistant fabric.',
    'https://images.unsplash.com/photo-1606744888344-493238951221?auto=format&fit=crop&w=800&q=80',
    50,
    50
  ),
  (
    gen_random_uuid(),
    '8ft Rectangle Tablecloth',
    'Black polyester tablecloth for 8ft rectangular tables. Wrinkle-resistant fabric.',
    'https://images.unsplash.com/photo-1606744888344-493238951221?auto=format&fit=crop&w=800&q=80',
    30,
    30
  ),
  (
    gen_random_uuid(),
    'Retractable Banner Stand',
    '33" x 81" retractable banner stand with carrying case. Professional grade aluminum.',
    'https://images.unsplash.com/photo-1586980368323-8ce5d3d3b957?auto=format&fit=crop&w=800&q=80',
    25,
    25
  ),
  (
    gen_random_uuid(),
    'Round Cocktail Table',
    '30" diameter cocktail table, perfect for networking events. 42" height.',
    'https://images.unsplash.com/photo-1595201832137-8b42646c97b1?auto=format&fit=crop&w=800&q=80',
    20,
    20
  ),
  (
    gen_random_uuid(),
    'Folding Chair',
    'Black padded folding chair. Comfortable seating for extended periods.',
    'https://images.unsplash.com/photo-1581539250439-c96689b516dd?auto=format&fit=crop&w=800&q=80',
    100,
    100
  ),
  (
    gen_random_uuid(),
    'Literature Stand',
    'Portable literature display stand with 6 pockets. Includes carrying case.',
    'https://images.unsplash.com/photo-1586980368323-8ce5d3d3b957?auto=format&fit=crop&w=800&q=80',
    15,
    15
  ),
  (
    gen_random_uuid(),
    'Table Runner',
    '14" x 108" black table runner with company logo. Premium polyester fabric.',
    'https://images.unsplash.com/photo-1606744888344-493238951221?auto=format&fit=crop&w=800&q=80',
    40,
    40
  ),
  (
    gen_random_uuid(),
    'Display Counter',
    'Portable display counter with internal shelf and graphic panel. Includes wheeled case.',
    'https://images.unsplash.com/photo-1586980368323-8ce5d3d3b957?auto=format&fit=crop&w=800&q=80',
    8,
    8
  ),
  (
    gen_random_uuid(),
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
    SELECT 1 FROM promo_items WHERE name = '10x10 Event Tent'
  ) THEN
    RAISE EXCEPTION 'Failed to insert new items';
  END IF;
END $$;