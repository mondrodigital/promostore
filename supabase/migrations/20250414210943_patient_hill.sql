/*
  # Fix RLS policies for promo items

  1. Changes
    - Simplify RLS policies for promo items
    - Add explicit admin check in policies
    - Ensure proper access control for CRUD operations

  2. Security
    - Enable RLS on promo_items table
    - Add policy for admin users to manage items
    - Add policy for public users to view items
*/

-- First disable RLS to reset policies
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage promo items" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;

-- Re-enable RLS
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;

-- Create new policies with simpler conditions
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
);

CREATE POLICY "Public can view promo items"
ON promo_items
FOR SELECT
TO public
USING (true);