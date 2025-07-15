-- Fix duplicate key conflict for wishlist_available_notification template
INSERT INTO email_settings (template_id, subject, body_html, notification_type)
VALUES (
    'wishlist_available_notification',
    'Item Available: {{itemName}}',
    '<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #0075AE;">Great News! Item Now Available</h2>
    <p>Dear {{userName}},</p>

    <p>Good news! The item you requested is now available for your event.</p>

    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #0075AE; margin-top: 0;">Item Details</h3>
        <p><strong>Item:</strong> {{itemName}}</p>
        <p><strong>Quantity Available:</strong> {{requestedQuantity}}</p>
    </div>

    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #0075AE; margin-top: 0;">Event Dates</h3>
        <p><strong>Pickup Date:</strong> {{requestedPickupDate}}</p>
        <p><strong>Return Date:</strong> {{requestedReturnDate}}</p>
    </div>

    <p>Please contact us if you would like to add this item to your order.</p>

    <p style="margin-top: 30px;">Best regards,<br>Vellum Marketing Team</p>
</body>
</html>',
    'customer'
)
ON CONFLICT (template_id) 
DO UPDATE SET 
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    notification_type = EXCLUDED.notification_type; 