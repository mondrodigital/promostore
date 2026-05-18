-- =============================================================================
-- Fix: availability functions used c.checkout_date / c.return_date but those
-- columns live on the orders table, not on checkouts.
-- Replace c.checkout_date -> o.checkout_date and c.return_date -> o.return_date
-- across get_available_quantity, get_available_quantities_bulk, get_item_conflicts.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Single-item date-aware availability (fixed)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_available_quantity(
  p_item_id uuid,
  p_start   date,
  p_end     date
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total       integer;
  v_committed   integer;
BEGIN
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'get_available_quantity: p_item_id is required';
  END IF;

  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'get_available_quantity: p_start and p_end are required';
  END IF;

  IF p_end < p_start THEN
    RAISE EXCEPTION 'get_available_quantity: p_end (%) must be >= p_start (%)', p_end, p_start;
  END IF;

  SELECT total_quantity
  INTO v_total
  FROM promo_items
  WHERE id = p_item_id;

  IF v_total IS NULL THEN
    RAISE EXCEPTION 'get_available_quantity: item % not found', p_item_id;
  END IF;

  SELECT COALESCE(SUM(c.quantity), 0)
  INTO v_committed
  FROM checkouts c
  JOIN orders o ON o.id = c.order_id
  WHERE c.item_id = p_item_id
    AND o.status NOT IN ('returned', 'cancelled', 'wishlist_only')
    -- Overlap: [a,b] and [x,y] overlap iff a <= y AND b >= x
    AND o.checkout_date <= p_end
    AND o.return_date   >= p_start;

  RETURN GREATEST(v_total - v_committed, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_quantity(uuid, date, date) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2) Bulk date-aware availability (fixed)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_available_quantities_bulk(
  p_item_ids uuid[],
  p_start    date,
  p_end      date
)
RETURNS TABLE (
  item_id            uuid,
  total_quantity     integer,
  available_quantity integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'get_available_quantities_bulk: p_start and p_end are required';
  END IF;

  IF p_end < p_start THEN
    RAISE EXCEPTION 'get_available_quantities_bulk: p_end (%) must be >= p_start (%)', p_end, p_start;
  END IF;

  RETURN QUERY
  WITH requested AS (
    SELECT pi.id             AS item_id,
           pi.total_quantity AS total_quantity
    FROM promo_items pi
    WHERE pi.id = ANY(p_item_ids)
  ),
  committed AS (
    SELECT c.item_id,
           SUM(c.quantity)::integer AS committed_qty
    FROM checkouts c
    JOIN orders o ON o.id = c.order_id
    WHERE c.item_id = ANY(p_item_ids)
      AND o.status NOT IN ('returned', 'cancelled', 'wishlist_only')
      AND o.checkout_date <= p_end
      AND o.return_date   >= p_start
    GROUP BY c.item_id
  )
  SELECT
    r.item_id,
    r.total_quantity,
    GREATEST(r.total_quantity - COALESCE(cm.committed_qty, 0), 0) AS available_quantity
  FROM requested r
  LEFT JOIN committed cm ON cm.item_id = r.item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_quantities_bulk(uuid[], date, date) TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3) Per-item conflict ranges — PRIVACY-SAFE (fixed)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_item_conflicts(
  p_item_id uuid,
  p_start   date,
  p_end     date
)
RETURNS TABLE (
  checkout_date  date,
  return_date    date,
  quantity       integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'get_item_conflicts: p_item_id is required';
  END IF;

  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'get_item_conflicts: p_start and p_end are required';
  END IF;

  RETURN QUERY
  SELECT
    o.checkout_date,
    o.return_date,
    SUM(c.quantity)::integer AS quantity
  FROM checkouts c
  JOIN orders o ON o.id = c.order_id
  WHERE c.item_id = p_item_id
    AND o.status NOT IN ('returned', 'cancelled', 'wishlist_only')
    AND o.checkout_date <= p_end
    AND o.return_date   >= p_start
  GROUP BY o.checkout_date, o.return_date
  ORDER BY o.checkout_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_item_conflicts(uuid, date, date) TO anon, authenticated;
