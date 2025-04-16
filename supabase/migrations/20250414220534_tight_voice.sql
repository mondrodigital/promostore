/*
  # Fix RLS policies for promo items

  1. Changes
    - Simplifies RLS policies for promo items
    - Ensures proper admin access for all operations
    - Maintains public read access
    - Removes unnecessary WITH CHECK clause that was causing issues
  
  2. Security
    - Maintains row level security
    - Properly validates admin status
    - Allows public read access
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
AS PERMISSIVE
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
AS PERMISSIVE
FOR SELECT
TO public
USING (true);