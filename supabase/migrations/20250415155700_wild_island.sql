-- Create debugging functions
CREATE OR REPLACE FUNCTION debug_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_user_id uuid;
  v_is_authenticated boolean;
BEGIN
  -- Get current role and authentication status
  SELECT 
    current_user,
    auth.uid(),
    auth.role() = 'authenticated'
  INTO v_role, v_user_id, v_is_authenticated;

  RETURN jsonb_build_object(
    'role', v_role,
    'user_id', v_user_id,
    'is_authenticated', v_is_authenticated,
    'current_database', current_database(),
    'current_schema', current_schema
  );
END;
$$;

-- Create function to test promo item operations
CREATE OR REPLACE FUNCTION test_promo_item_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_test_id uuid;
  v_result jsonb;
BEGIN
  -- Try to insert a test item
  INSERT INTO promo_items (
    name,
    description,
    total_quantity,
    available_quantity
  ) VALUES (
    'Test Item ' || now(),
    'Test Description',
    10,
    10
  ) RETURNING id INTO v_test_id;

  -- Try to read the item
  SELECT jsonb_build_object(
    'id', id,
    'name', name
  )
  FROM promo_items
  WHERE id = v_test_id
  INTO v_result;

  -- Try to update the item
  UPDATE promo_items
  SET description = 'Updated Description'
  WHERE id = v_test_id;

  -- Try to delete the item
  DELETE FROM promo_items
  WHERE id = v_test_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'All operations completed successfully',
    'test_item', v_result,
    'debug_info', debug_request()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'debug_info', debug_request()
  );
END;
$$;

-- Reset RLS and policies
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can manage promo items" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;

-- Re-enable RLS with debugging
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;

-- Create more permissive policies
CREATE POLICY "Anyone can manage promo items"
ON promo_items
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Grant full permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Update the promo item function with better error handling
CREATE OR REPLACE FUNCTION update_promo_item(
  p_id uuid,
  p_name text,
  p_description text,
  p_image_url text,
  p_total_quantity integer,
  p_available_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_debug jsonb;
BEGIN
  -- Get debug info
  SELECT debug_request() INTO v_debug;

  -- Update the item
  UPDATE promo_items
  SET
    name = p_name,
    description = p_description,
    image_url = p_image_url,
    total_quantity = p_total_quantity,
    available_quantity = p_available_quantity,
    updated_at = now()
  WHERE id = p_id
  RETURNING jsonb_build_object(
    'id', id,
    'name', name,
    'description', description,
    'image_url', image_url,
    'total_quantity', total_quantity,
    'available_quantity', available_quantity,
    'updated_at', updated_at
  ) INTO v_result;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Item not found',
      'debug_info', v_debug
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_result,
    'debug_info', v_debug
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'debug_info', v_debug
  );
END;
$$;

-- Test the setup
SELECT test_promo_item_access();