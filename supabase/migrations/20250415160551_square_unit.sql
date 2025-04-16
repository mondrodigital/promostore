-- Drop existing RLS policies
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage promo items" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;

-- Re-enable RLS
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;

-- Create new policies with no authentication requirements
CREATE POLICY "Anyone can do anything"
ON promo_items
FOR ALL 
TO PUBLIC
USING (true)
WITH CHECK (true);

-- Create function to check access
CREATE OR REPLACE FUNCTION check_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_claims jsonb;
BEGIN
  -- Get current role and claims
  SELECT current_setting('request.jwt.claims', true)::jsonb INTO v_claims;
  SELECT current_setting('role') INTO v_role;

  RETURN jsonb_build_object(
    'role', v_role,
    'claims', v_claims,
    'current_user', current_user,
    'session_user', session_user
  );
END;
$$;

-- Grant all permissions to public roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;