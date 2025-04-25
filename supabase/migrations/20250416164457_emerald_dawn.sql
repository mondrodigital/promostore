-- Drop existing trigger
DROP TRIGGER IF EXISTS update_inventory_on_status_change ON orders;
DROP FUNCTION IF EXISTS update_inventory_on_status_change();

-- Create updated function for inventory management
CREATE OR REPLACE FUNCTION update_inventory_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_total_quantity integer;
BEGIN
  -- Handle new pending orders
  IF NEW.status = 'pending' AND OLD.status IS NULL THEN
    -- Check if enough inventory is available
    IF EXISTS (
      SELECT 1 FROM checkouts c
      JOIN promo_items pi ON c.item_id = pi.id
      WHERE c.order_id = NEW.id
      AND pi.available_quantity < c.quantity
    ) THEN
      RAISE EXCEPTION 'Not enough inventory available for one or more items';
    END IF;
    
    -- Decrease available quantities
    UPDATE promo_items pi
    SET available_quantity = available_quantity - c.quantity
    FROM checkouts c
    WHERE c.item_id = pi.id
    AND c.order_id = NEW.id;

  -- Handle cancellations
  ELSIF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'picked_up') THEN
    -- Restore inventory for cancelled orders, capped at total_quantity
    FOR v_total_quantity IN 
      SELECT pi.total_quantity 
      FROM promo_items pi
      JOIN checkouts c ON c.item_id = pi.id
      WHERE c.order_id = NEW.id
      FOR UPDATE
    LOOP
      UPDATE promo_items pi
      SET available_quantity = LEAST(v_total_quantity, available_quantity + c.quantity)
      FROM checkouts c
      WHERE c.item_id = pi.id
      AND c.order_id = NEW.id;
    END LOOP;

  -- Handle returns
  ELSIF NEW.status = 'returned' AND OLD.status = 'picked_up' THEN
    -- Restore inventory for returned items, capped at total_quantity
    FOR v_total_quantity IN 
      SELECT pi.total_quantity 
      FROM promo_items pi
      JOIN checkouts c ON c.item_id = pi.id
      WHERE c.order_id = NEW.id
      AND c.returned = true
      FOR UPDATE
    LOOP
      UPDATE promo_items pi
      SET available_quantity = LEAST(v_total_quantity, available_quantity + c.quantity)
      FROM checkouts c
      WHERE c.item_id = pi.id
      AND c.order_id = NEW.id
      AND c.returned = true;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_inventory_on_status_change
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_status_change(); 