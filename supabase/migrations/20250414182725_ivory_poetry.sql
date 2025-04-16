-- Clear existing items
DELETE FROM promo_items;

-- Insert new items with high-quality images
INSERT INTO promo_items (name, description, image_url, total_quantity, available_quantity) VALUES
  (
    'Premium LED Video Wall',
    'Modular LED video wall system with 4K resolution and seamless panel connection.',
    'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=800&q=80',
    4,
    4
  ),
  (
    'Professional Stage Kit',
    'Complete stage setup including risers, stairs, and safety rails.',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80',
    3,
    3
  ),
  (
    'Digital Kiosk Display',
    'Interactive touchscreen kiosk with integrated computer and custom software.',
    'https://images.unsplash.com/photo-1612831455359-970e23a1e4e9?auto=format&fit=crop&w=800&q=80',
    6,
    6
  ),
  (
    'Event Audio Package',
    'Professional sound system with digital mixer and wireless microphones.',
    'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?auto=format&fit=crop&w=800&q=80',
    5,
    5
  ),
  (
    'Exhibition Booth Setup',
    'Modular 20x20 booth with custom graphics and LED lighting.',
    'https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=800&q=80',
    2,
    2
  ),
  (
    'Professional Lighting Kit',
    'Complete lighting package with moving heads, wash lights, and controller.',
    'https://images.unsplash.com/photo-1504501650895-2441b7915699?auto=format&fit=crop&w=800&q=80',
    8,
    8
  ),
  (
    'Event Photography Package',
    'Professional DSLR camera kit with lenses and studio lighting.',
    'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
    4,
    4
  ),
  (
    'Conference Furniture Set',
    'Modern lounge furniture including sofas, chairs, and coffee tables.',
    'https://images.unsplash.com/photo-1577401132921-cb39bb0adcff?auto=format&fit=crop&w=800&q=80',
    10,
    10
  ),
  (
    'Digital Presentation Display',
    '85" 4K LED display with floor stand and content management system.',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&q=80',
    6,
    6
  ),
  (
    'Mobile Stage System',
    'Portable staging with modular platforms and professional backdrop.',
    'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=800&q=80',
    3,
    3
  ),
  (
    'Event Registration Setup',
    'Complete check-in station with badge printers and scanners.',
    'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=80',
    5,
    5
  ),
  (
    'Mobile Charging Station',
    'Secure charging locker with multiple device compatibility.',
    'https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&w=800&q=80',
    8,
    8
  );