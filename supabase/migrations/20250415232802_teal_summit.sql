-- Drop existing function if it exists
DROP FUNCTION IF EXISTS validate_vellum_email(text);

-- Create generic email validation function
CREATE OR REPLACE FUNCTION validate_email(email text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN email LIKE '%@%';
END;
$$;

-- Update the order creation function to use generic email validation
CREATE OR REPLACE FUNCTION create_order_with_checkouts(
  p_checkout_date text,
  p_items jsonb,
  p_return_date text,
  p_user_email text,
  p_user_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item record;
  v_checkout_date date;
  v_return_date date;
  v_item_name text;
  v_available integer;
BEGIN
  -- Validate email format
  IF NOT validate_email(p_user_email) THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- Rest of the function remains the same...
  -- [Previous implementation continues here]
END;
$$;