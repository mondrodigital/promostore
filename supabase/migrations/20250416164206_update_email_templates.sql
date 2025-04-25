-- Rename columns to match the working configuration
ALTER TABLE email_settings 
  RENAME COLUMN subject_template TO subject;

ALTER TABLE email_settings 
  RENAME COLUMN body_template TO body_html;

-- Add template_id column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'email_settings' 
                   AND column_name = 'template_id') THEN
        ALTER TABLE email_settings 
        ADD COLUMN template_id text UNIQUE;
    END IF;
END $$;

-- Insert or update the templates
INSERT INTO email_settings (template_id, subject, body_html)
VALUES 
    ('picked_up_confirmation',
    'Equipment Pickup Confirmed',
    'Dear {customerName},

This email confirms that you have picked up the following items:

{itemsHtml}

Please remember to return these items by {returnDate}.

Best regards,
The Events Team')
ON CONFLICT (template_id) 
DO UPDATE SET 
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html;

INSERT INTO email_settings (template_id, subject, body_html)
VALUES 
    ('returned_confirmation',
    'Equipment Return Confirmed',
    'Dear {customerName},

This email confirms that you have returned the following items:

{itemsHtml}

Thank you for using our equipment service!

Best regards,
The Events Team')
ON CONFLICT (template_id) 
DO UPDATE SET 
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html;

INSERT INTO email_settings (template_id, subject, body_html)
VALUES 
    ('order_cancelled',
    'Order Cancelled',
    'Dear {customerName},

Your order (ID: {orderId}) has been cancelled.

If you did not request this cancellation, please contact us immediately.

Best regards,
The Events Team')
ON CONFLICT (template_id) 
DO UPDATE SET 
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html; 