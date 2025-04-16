-- Create email_settings table
CREATE TABLE email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_name text NOT NULL UNIQUE,
  enabled boolean DEFAULT true,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  recipients text[] DEFAULT ARRAY['marketing@vellummortgage.com']::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add default email templates
INSERT INTO email_settings (setting_name, subject_template, body_template, recipients) VALUES
  (
    'order_confirmation',
    'Order Confirmation: Your equipment request has been received',
    'Dear {{user_name}},

Thank you for your equipment request. Here are your order details:

Pickup Date: {{pickup_date}}
Return Date: {{return_date}}

Items:
{{#items}}
- {{name}} (Quantity: {{quantity}})
{{/items}}

We will contact you with further instructions for pickup.

Best regards,
The Events Team',
    ARRAY['marketing@vellummortgage.com']::text[]
  ),
  (
    'new_order_notification',
    'New Equipment Order Received',
    'A new equipment order has been received:

Order Details:
User: {{user_name}} ({{user_email}})
Pickup Date: {{pickup_date}}
Return Date: {{return_date}}

Items:
{{#items}}
- {{name}} (Quantity: {{quantity}})
{{/items}}

Please process this order accordingly.',
    ARRAY['marketing@vellummortgage.com']::text[]
  );

-- Add RLS policies
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public can view email settings"
  ON email_settings
  FOR SELECT
  TO public
  USING (true);

-- Allow authenticated users to update settings
CREATE POLICY "Authenticated users can update email settings"
  ON email_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);