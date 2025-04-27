-- Update order notification template
UPDATE email_settings
SET body_html = '
<h2>New Event Item Order</h2>
<p>A new order has been placed for event items.</p>

<h3>Order Details</h3>
<p><strong>Order ID:</strong> {{orderId}}</p>
<p><strong>Customer Name:</strong> {{customerName}}</p>
<p><strong>Customer Email:</strong> {{customerEmail}}</p>

<h3>Event Information</h3>
<p><strong>Event Start Date:</strong> {{eventStartDate}}</p>
<p><strong>Event End Date:</strong> {{eventEndDate}}</p>

<h3>Item Pickup & Return</h3>
<p><strong>Pickup Date:</strong> {{pickupDate}}</p>
<p><strong>Return Date:</strong> {{returnDate}}</p>

<h3>Items Requested</h3>
{{items}}
'
WHERE template_id = 'order_notification';

-- Update user confirmation template
UPDATE email_settings
SET body_html = '
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #0075AE;">Your Event Item Order Confirmation</h2>
    <p>Dear {{customerName}},</p>

    <p>Thank you for your order! We have received your request for event items.</p>

    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #0075AE; margin-top: 0;">Order Details</h3>
        <p><strong>Order ID:</strong> {{orderId}}</p>
    </div>

    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #0075AE; margin-top: 0;">Event Information</h3>
        <p><strong>Event Start Date:</strong> {{eventStartDate}}</p>
        <p><strong>Event End Date:</strong> {{eventEndDate}}</p>
    </div>

    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #0075AE; margin-top: 0;">Item Pickup & Return</h3>
        <p><strong>Pickup Date:</strong> {{pickupDate}}</p>
        <p><strong>Return Date:</strong> {{returnDate}}</p>
    </div>

    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #0075AE; margin-top: 0;">Items Ordered</h3>
        {{items}}
    </div>

    <p>Our marketing team will review your order and contact you with any questions. You will receive a confirmation email when your order is approved.</p>

    <p style="margin-top: 30px;">Best regards,<br>Vellum Marketing Team</p>
</body>
</html>
'
WHERE template_id = 'user_confirmation';

-- Update subject templates to mention event
UPDATE email_settings
SET subject = 'New Event Item Order: {{orderId}}'
WHERE template_id = 'order_notification';

UPDATE email_settings
SET subject = 'Event Item Order Confirmation: {{orderId}}'
WHERE template_id = 'user_confirmation'; 