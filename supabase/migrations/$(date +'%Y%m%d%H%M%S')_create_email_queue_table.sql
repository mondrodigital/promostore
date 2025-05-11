-- Create the email queue table to handle asynchronous email sending

CREATE TYPE email_status AS ENUM ('pending', 'processing', 'sent', 'failed');

CREATE TABLE email_queue (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    processed_at TIMESTAMPTZ,
    status email_status DEFAULT 'pending' NOT NULL,
    notification_type TEXT NOT NULL, -- e.g., 'wishlist_user', 'wishlist_marketing', 'order_confirmation'
    payload JSONB NOT NULL, -- Contains recipient, subject parts, body parts, etc.
    last_attempt_at TIMESTAMPTZ,
    retry_count INT DEFAULT 0 NOT NULL,
    error_message TEXT -- Store last error message if failed
);

-- Add indexes for efficient querying by the processor
CREATE INDEX idx_email_queue_status_created_at ON email_queue (status, created_at);
CREATE INDEX idx_email_queue_notification_type ON email_queue (notification_type);

-- Enable RLS
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- Policies: 
-- Allow service_role full access (standard for backend processes)
CREATE POLICY "Allow service role access" 
    ON email_queue 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Allow authenticated users (or specific roles like admin) to potentially insert? 
-- Or maybe only the DB functions should insert? Let's restrict for now.
-- If needed later, we can add:
-- CREATE POLICY "Allow specific function/role to insert" 
--    ON email_queue 
--    FOR INSERT 
--    TO authenticated -- or a specific role
--    WITH CHECK (true); -- Add specific checks if needed

-- No SELECT/UPDATE/DELETE for regular users initially.

-- Add comment on the table
COMMENT ON TABLE email_queue IS 'Stores email notifications to be processed asynchronously.';
COMMENT ON COLUMN email_queue.status IS 'The processing status of the email notification.';
COMMENT ON COLUMN email_queue.notification_type IS 'Identifier for the type of email to be sent (maps to templates/functions).';
COMMENT ON COLUMN email_queue.payload IS 'JSON data required to generate and send the email.';
COMMENT ON COLUMN email_queue.retry_count IS 'Number of times processing has been attempted for this email.'; 