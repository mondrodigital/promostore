-- Update promo items with better images
UPDATE promo_items
SET 
  image_url = CASE name
    WHEN 'Digital Display Stand' THEN 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&q=80'
    WHEN 'Event Backdrop Kit' THEN 'https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=800&q=80'
    WHEN 'Mobile Stage Platform' THEN 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80'
    WHEN 'Pro Audio Package' THEN 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?auto=format&fit=crop&w=800&q=80'
    WHEN 'Event Lighting Kit' THEN 'https://images.unsplash.com/photo-1504501650895-2441b7915699?auto=format&fit=crop&w=800&q=80'
  END
WHERE name IN (
  'Digital Display Stand',
  'Event Backdrop Kit',
  'Mobile Stage Platform',
  'Pro Audio Package',
  'Event Lighting Kit'
);

-- Delete any existing items and insert fresh ones with high-quality images
DELETE FROM promo_items;

INSERT INTO promo_items (name, description, image_url, total_quantity, available_quantity) VALUES
  (
    'Professional LED Wall',
    'Modular LED video wall system, perfect for large-scale displays and immersive experiences.',
    'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=800&q=80',
    4,
    4
  ),
  (
    'Premium Stage Kit',
    'Complete stage setup with professional lighting and sound-dampening backdrop.',
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
  ),
  (
    'Digital Signage Display',
    '65" 4K commercial display with floor stand and content management system.',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&q=80',
    8,
    8
  ),
  (
    'Tradeshow Booth Package',
    'Complete 10x20 booth setup with counters, lighting, and branded backdrop.',
    'https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=800&q=80',
    2,
    2
  ),
  (
    'Interactive Touch Display',
    '55" multi-touch display with integrated computer and presentation software.',
    'https://images.unsplash.com/photo-1612831455359-970e23a1e4e9?auto=format&fit=crop&w=800&q=80',
    4,
    4
  ),
  (
    'Mobile Stage Platform',
    'Portable staging system with safety rails and adjustable height.',
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=800&q=80',
    3,
    3
  ),
  (
    'Professional Camera Kit',
    'DSLR camera package with lenses and lighting for event photography.',
    'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
    5,
    5
  ),
  (
    'Event Furniture Set',
    'Modern lounge furniture package including sofas, chairs, and tables.',
    'https://images.unsplash.com/photo-1577401132921-cb39bb0adcff?auto=format&fit=crop&w=800&q=80',
    4,
    4
  );