/*
  # Update RLS policies for promo items

  1. Changes
    - Drop existing policies on promo_items table
    - Add new policy to allow public access to view items
    - Keep admin management policy

  2. Security
    - Enable public read access to promo items
    - Maintain admin-only write access
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view promo items" ON promo_items;
DROP POLICY IF EXISTS "Admins can manage promo items" ON promo_items;

-- Create new policies
CREATE POLICY "Public can view promo items"
ON promo_items
FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins can manage promo items"
ON promo_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
  )
);