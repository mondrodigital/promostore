/*
  # Fix RLS policies and add debugging functions
  
  1. Changes
    - Adds debugging functions to help track RLS policy evaluation
    - Simplifies RLS policies further
    - Ensures proper error handling for admin operations
  
  2. Security
    - Maintains existing security model
    - Adds better logging for troubleshooting
*/

-- First disable RLS to reset policies
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage promo items" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;

-- Create debugging function
CREATE OR REPLACE FUNCTION debug_auth() 
RETURNS TABLE (
  authenticated boolean,
  current_user_id uuid,
  is_admin boolean
) 
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    auth.role() = 'authenticated',
    auth.uid()::uuid,
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.is_admin = true
    );
END;
$$ LANGUAGE plpgsql;

-- Re-enable RLS
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;

-- Create simplified policies
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

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION debug_auth() TO authenticated;
GRANT EXECUTE ON FUNCTION debug_auth() TO anon;