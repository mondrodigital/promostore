-- Reset inventory quantities
UPDATE promo_items
SET available_quantity = total_quantity;

-- Add function to check inventory
CREATE OR REPLACE FUNCTION check_inventory()
RETURNS TABLE (
  id uuid,
  name text,
  total_quantity integer,
  available_quantity integer,
  pending_orders integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pi.id,
    pi.name,
    pi.total_quantity,
    pi.available_quantity,
    COALESCE(SUM(
      CASE 
        WHEN o.status IN ('pending', 'picked_up') THEN c.quantity 
        ELSE 0 
      END
    ), 0)::integer as pending_orders
  FROM promo_items pi
  LEFT JOIN checkouts c ON c.item_id = pi.id
  LEFT JOIN orders o ON c.order_id = o.id
  GROUP BY pi.id, pi.name, pi.total_quantity, pi.available_quantity
  ORDER BY pi.name;
END;
$$ LANGUAGE plpgsql;

-- Check current inventory status
SELECT * FROM check_inventory();