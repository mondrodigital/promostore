-- Clear existing data
DELETE FROM checkouts;
DELETE FROM orders;
DELETE FROM promo_items;

-- Insert new event equipment items
INSERT INTO promo_items (name, description, image_url, total_quantity, available_quantity) VALUES
  (
    'Professional LED Display',
    '55" 4K LED display with floor stand. Perfect for digital signage and presentations.',
    'https://images.unsplash.com/photo-1542393545-10f5cde2c810?auto=format&fit=crop&w=800&q=80',
    10,
    10
  ),
  (
    'Premium Booth Package',
    '10x10 booth setup including backdrop, counter, and lighting. Modern design.',
    'https://images.unsplash.com/photo-1591115765373-5207764f72e7?auto=format&fit=crop&w=800&q=80',
    5,
    5
  ),
  (
    'Wireless PA System',
    'Professional sound system with wireless mic, perfect for presentations and events.',
    'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?auto=format&fit=crop&w=800&q=80',
    8,
    8
  ),
  (
    'Digital Kiosk',
    'Interactive touchscreen kiosk with built-in software for visitor engagement.',
    'https://images.unsplash.com/photo-1612831455359-970e23a1e4e9?auto=format&fit=crop&w=800&q=80',
    6,
    6
  ),
  (
    'Event Lighting Package',
    'Professional LED lighting kit including uplights and spotlights.',
    'https://images.unsplash.com/photo-1504501650895-2441b7915699?auto=format&fit=crop&w=800&q=80',
    12,
    12
  ),
  (
    'Conference Furniture Set',
    'Modern seating arrangement for 10 including chairs and high tables.',
    'https://images.unsplash.com/photo-1577401132921-cb39bb0adcff?auto=format&fit=crop&w=800&q=80',
    15,
    15
  ),
  (
    'Digital Badge Scanner',
    'Professional badge scanner with real-time data sync capabilities.',
    'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=80',
    20,
    20
  ),
  (
    'Mobile Charging Station',
    'Secure charging locker with multiple device support and branding space.',
    'https://images.unsplash.com/photo-1585338107529-13afc5f02586?auto=format&fit=crop&w=800&q=80',
    8,
    8
  ),
  (
    'Virtual Reality Kit',
    'Complete VR setup including headset and interactive content management.',
    'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?auto=format&fit=crop&w=800&q=80',
    4,
    4
  ),
  (
    'Event Photography Package',
    'Professional camera kit with lighting equipment for event documentation.',
    'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
    3,
    3
  );