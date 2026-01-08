-- Create wishlist_requests table
-- This table stores wishlist items that users want when they become available

CREATE TABLE IF NOT EXISTS wishlist_requests (
    id SERIAL PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_name text NOT NULL,
    user_email text NOT NULL,
    item_id uuid NOT NULL REFERENCES promo_items(id) ON DELETE CASCADE,
    requested_quantity integer NOT NULL CHECK (requested_quantity > 0),
    requested_pickup_date date NOT NULL,
    requested_return_date date NOT NULL,
    event_start_date date NOT NULL,
    event_end_date date NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'added_to_order', 'cancelled')),
    created_at timestamptz DEFAULT now(),
    notified_at timestamptz,
    
    -- Ensure valid date ranges
    CONSTRAINT valid_pickup_return_dates CHECK (requested_return_date > requested_pickup_date),
    CONSTRAINT valid_event_dates CHECK (event_end_date >= event_start_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_order_id ON wishlist_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_item_id ON wishlist_requests(item_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_status ON wishlist_requests(status);
CREATE INDEX IF NOT EXISTS idx_wishlist_requests_user_email ON wishlist_requests(user_email);

-- Enable RLS (Row Level Security)
ALTER TABLE wishlist_requests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view all wishlist requests" ON wishlist_requests FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert wishlist requests" ON wishlist_requests FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can update their own wishlist requests" ON wishlist_requests FOR UPDATE TO public USING (true);
CREATE POLICY "Users can delete their own wishlist requests" ON wishlist_requests FOR DELETE TO public USING (true);
