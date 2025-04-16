/*
  # Add Sample Promotional Items

  This migration adds a diverse set of promotional items to showcase the inventory system.
  
  Categories include:
  1. Event Equipment
  2. Branded Merchandise
  3. Marketing Materials
  4. Tech Accessories
  5. Office Supplies
*/

-- Insert sample promotional items
INSERT INTO promo_items (name, description, image_url, total_quantity, available_quantity)
VALUES
  -- Event Equipment
  ('10x10 Pop-up Tent', 'Professional-grade pop-up tent with company branding. Perfect for outdoor events.', 'https://images.unsplash.com/photo-1601925165391-e5d6602e9899', 10, 10),
  ('Portable Stage', '8x12 portable stage with adjustable height. Includes stairs and safety rails.', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7', 2, 2),
  ('LED Display Stand', '65" digital display stand with built-in media player for presentations.', 'https://images.unsplash.com/photo-1601847562409-8433d213f93b', 4, 4),
  ('Event Backdrop', '8x10 step-and-repeat backdrop with adjustable frame.', 'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04', 5, 5),
  ('Portable PA System', 'Complete sound system with speakers, mixer, and wireless microphones.', 'https://images.unsplash.com/photo-1516280440614-37939bbacd81', 3, 3),

  -- Branded Merchandise
  ('Premium Polo Shirts', 'High-quality embroidered polo shirts with company logo. Various sizes.', 'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99', 200, 200),
  ('Custom Water Bottles', 'Stainless steel water bottles with company branding.', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8', 500, 500),
  ('Branded Backpacks', 'Durable laptop backpacks with embroidered logo.', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62', 150, 150),
  ('Corporate Jackets', 'Lightweight softshell jackets with embroidered logo.', 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea', 100, 100),
  ('Custom Umbrellas', 'Automatic umbrellas with company logo.', 'https://images.unsplash.com/photo-1538905386057-4a5a9f2a3bb6', 200, 200),

  -- Marketing Materials
  ('Retractable Banners', 'Professional roll-up banners with carrying case.', 'https://images.unsplash.com/photo-1588200618450-3a35b3d3ae9c', 20, 20),
  ('Table Runners', 'Branded table runners for trade shows.', 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678', 30, 30),
  ('Product Brochures', 'High-quality tri-fold brochures showcasing products.', 'https://images.unsplash.com/photo-1532153975070-2e9ab71f1b14', 1000, 1000),
  ('Business Cards', 'Premium business cards with spot UV finish.', 'https://images.unsplash.com/photo-1516342243255-ac2202f9f149', 5000, 5000),
  ('Promotional Flags', 'Teardrop flags with ground stake and carrying bag.', 'https://images.unsplash.com/photo-1577542770674-3d3b993b18cf', 15, 15),

  -- Tech Accessories
  ('Wireless Chargers', 'Fast-charging wireless pads with company logo.', 'https://images.unsplash.com/photo-1622445275463-afa2ab738c34', 300, 300),
  ('USB Power Banks', '10000mAh power banks with dual USB ports.', 'https://images.unsplash.com/photo-1609592424825-fe0e0b25c9f9', 250, 250),
  ('Bluetooth Speakers', 'Portable speakers with company branding.', 'https://images.unsplash.com/photo-1589256469067-ea99122bbdc4', 100, 100),
  ('Webcam Covers', 'Sliding webcam covers with company logo.', 'https://images.unsplash.com/photo-1622445275576-721325763afe', 1000, 1000),
  ('Phone Stands', 'Adjustable aluminum phone stands with branding.', 'https://images.unsplash.com/photo-1586105251261-72a756497a11', 400, 400),

  -- Office Supplies
  ('Custom Notebooks', 'Hardcover notebooks with company branding.', 'https://images.unsplash.com/photo-1531346680769-a1e9e7a1f226', 500, 500),
  ('Branded Pens', 'Premium metal pens with laser engraving.', 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd', 1000, 1000),
  ('Mouse Pads', 'High-quality mouse pads with company logo.', 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46', 300, 300),
  ('Desk Organizers', 'Bamboo desk organizers with subtle branding.', 'https://images.unsplash.com/photo-1587467512961-120760940315', 150, 150),
  ('Coffee Mugs', 'Ceramic mugs with company logo.', 'https://images.unsplash.com/photo-1577937927498-b0320ee898c5', 400, 400);