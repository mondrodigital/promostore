-- First disable RLS to reset policies
ALTER TABLE promo_items DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage promo items" ON promo_items;
DROP POLICY IF EXISTS "Public can view promo items" ON promo_items;

-- Re-enable RLS
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;

-- Create new policies with proper admin access
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

-- Create function to update promo item
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
BEGIN
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
    RAISE EXCEPTION 'Item not found';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_result
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;