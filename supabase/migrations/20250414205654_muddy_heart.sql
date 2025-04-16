/*
  # Fix RLS policies for promo items

  1. Changes
    - Update RLS policies for promo_items table to allow proper CRUD operations
    - Add policies for admins to manage items
    - Add policy for public to view items

  2. Security
    - Enable RLS on promo_items table
    - Add specific policies for different operations
*/

-- First disable RLS to reset policies
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage promo items" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;

-- Re-enable RLS
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;

-- Create new policies
CREATE POLICY "Admins can manage promo items"
ON promo_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
  )
);

CREATE POLICY "Public can view promo items"
ON promo_items
FOR SELECT
TO public
USING (true);