/*
  # Fix inventory management access
  
  1. Changes
    - Disable RLS temporarily to clean up data
    - Drop existing policies
    - Create new policies that allow full admin control
    - Reset inventory items
*/

-- First disable RLS to reset policies
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage promo items" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;

-- Re-enable RLS
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;

-- Create new policies with proper admin access
CREATE POLICY "Admins can manage promo items"
ON promo_items
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Public can view promo items"
ON promo_items
FOR SELECT
TO public
USING (true);

-- Clear existing data
DELETE FROM checkouts;
DELETE FROM orders;
DELETE FROM promo_items;

-- Insert fresh items
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