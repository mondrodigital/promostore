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
USING (true)
WITH CHECK (true);

CREATE POLICY "Public can view promo items"
ON promo_items
FOR SELECT
TO public
USING (true);