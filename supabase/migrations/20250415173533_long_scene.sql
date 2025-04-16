-- Disable RLS completely for all tables
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Anyone can do anything" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;
DROP POLICY IF EXISTS "Anyone can manage promo items" ON promo_items;

-- Grant all permissions to all roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Create function to check permissions
CREATE OR REPLACE FUNCTION check_permissions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object(
    'role', current_user,
    'has_promo_items_access', has_table_privilege('public.promo_items', 'INSERT'),
    'has_orders_access', has_table_privilege('public.orders', 'INSERT'),
    'has_checkouts_access', has_table_privilege('public.checkouts', 'INSERT')
  );
END;
$$;

-- Grant execute permission on the check function
GRANT EXECUTE ON FUNCTION check_permissions() TO anon;
GRANT EXECUTE ON FUNCTION check_permissions() TO authenticated;