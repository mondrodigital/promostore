-- Drop existing trigger and function
DROP TRIGGER IF EXISTS handle_inventory_changes ON checkouts;
DROP FUNCTION IF EXISTS handle_inventory_changes();

-- Create new function to handle inventory updates
CREATE OR REPLACE FUNCTION handle_inventory_changes()
RETURNS TRIGGER AS $$
DECLARE
  available_qty INTEGER;
  total_qty INTEGER;
BEGIN
  -- Get current quantities
  SELECT available_quantity, total_quantity 
  INTO available_qty, total_qty
  FROM promo_items
  WHERE id = NEW.item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  -- For new checkouts
  IF (TG_OP = 'INSERT') THEN
    -- Check if we have enough inventory
    IF available_qty < NEW.quantity THEN
      RAISE EXCEPTION 'Not enough inventory available for item. Requested: %, Available: %', 
        NEW.quantity, available_qty;
    END IF;

    -- Update available quantity
    UPDATE promo_items
    SET available_quantity = available_quantity - NEW.quantity
    WHERE id = NEW.item_id;

  -- For updates to existing checkouts
  ELSIF (TG_OP = 'UPDATE') THEN
    -- If item is being returned, add quantity back to inventory
    IF NEW.returned = true AND OLD.returned = false THEN
      UPDATE promo_items
      SET available_quantity = LEAST(total_qty, available_qty + NEW.quantity)
      WHERE id = NEW.item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for inventory updates
CREATE TRIGGER handle_inventory_changes
  BEFORE INSERT OR UPDATE
  ON checkouts
  FOR EACH ROW
  EXECUTE FUNCTION handle_inventory_changes();

-- Reset all inventory quantities to match actual state
UPDATE promo_items pi
SET available_quantity = pi.total_quantity - COALESCE(
  (
    SELECT SUM(c.quantity)
    FROM checkouts c
    WHERE c.item_id = pi.id
    AND c.returned = false
  ),
  0
);