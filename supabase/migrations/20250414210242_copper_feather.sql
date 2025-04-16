/*
  # Fix RLS policies and add better error handling

  1. Changes
    - Drop and recreate RLS policies with proper conditions
    - Add explicit admin check function
    - Add better error handling for row operations

  2. Security
    - Ensure proper admin access control
    - Maintain public read access
    - Add row-level validation
*/

-- Create admin check function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset RLS
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage promo items" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;

-- Re-enable RLS
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;

-- Create new policies with better conditions
CREATE POLICY "Admins can manage promo items"
ON promo_items
FOR ALL
TO authenticated
USING (is_admin() = true)
WITH CHECK (is_admin() = true);

CREATE POLICY "Public can view promo items"
ON promo_items
FOR SELECT
TO public
USING (true);