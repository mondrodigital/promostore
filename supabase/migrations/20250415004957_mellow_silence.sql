/*
  # Fix authentication debugging and access
  
  1. Changes
    - Recreates debug_auth function with proper permissions
    - Ensures function is accessible to all roles
    - Adds better error handling
  
  2. Security
    - Maintains security while allowing necessary access
    - Uses SECURITY DEFINER to ensure proper execution
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS debug_auth();

-- Create improved debug function
CREATE OR REPLACE FUNCTION debug_auth() 
RETURNS TABLE (
  authenticated boolean,
  current_user_id uuid,
  is_admin boolean,
  error text
) 
SECURITY DEFINER
AS $$
DECLARE
  _user_id uuid;
  _is_admin boolean;
BEGIN
  -- Check if user is authenticated
  IF auth.role() = 'authenticated' THEN
    _user_id := auth.uid()::uuid;
    
    -- Check admin status
    SELECT users.is_admin INTO _is_admin
    FROM users 
    WHERE users.id = _user_id;
    
    RETURN QUERY
    SELECT 
      true,
      _user_id,
      COALESCE(_is_admin, false),
      NULL::text;
  ELSE
    RETURN QUERY
    SELECT 
      false,
      NULL::uuid,
      false,
      'User is not authenticated'::text;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION debug_auth() TO authenticated;
GRANT EXECUTE ON FUNCTION debug_auth() TO anon;
GRANT EXECUTE ON FUNCTION debug_auth() TO service_role;