-- Add underwriter decision notification template
INSERT INTO email_settings (template_id, subject, body_html, notification_type)
VALUES (
    'underwriter_decision',
    'Underwriter Decision for Loan #{{364}}',
    '<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Underwriter Decision Notification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <style>
      body {
        background: #f6f8fa;
        margin: 0;
        padding: 0;
        font-family: ''Segoe UI'', Arial, sans-serif;
      }
      .container {
        max-width: 600px;
        margin: 32px auto;
        background: #fff;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      }
      .blue-bar {
        height: 6px;
        background: #0075AE;
        width: 100%;
        display: block;
      }
      .header {
        padding: 32px 32px 16px 32px;
        text-align: left;
      }
      .logo {
        height: 32px;
        margin-bottom: 16px;
      }
      .content {
        padding: 0 32px 32px 32px;
        color: #222;
        font-size: 16px;
        line-height: 1.6;
      }
      .divider {
        border: none;
        border-top: 1px solid #e5e7eb;
        margin: 24px 0;
      }
      .section-title {
        font-weight: 600;
        color: #003656;
        margin-top: 24px;
        margin-bottom: 8px;
      }
      @media (max-width: 600px) {
        .container, .header, .content { padding-left: 16px !important; padding-right: 16px !important; }
        .header { padding-top: 24px !important; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="blue-bar"></div>
      <div class="header">
        <h2 style="margin:0; color:#003656;">Underwriter Decision Notification</h2>
      </div>
      <div class="content">
        <p>
          A decision has been issued by the underwriter for loan #{{364}}. Please reference the eFolder for a detailed review of the conditions required by the underwriter. A summary is also included below:
        </p>
        <hr class="divider" />
        <div>
          <div class="section-title">Not Cleared Conditions:</div>
          <div>
            {{UWC.NOTCLEARED}}
          </div>
        </div>
        <div>
          <div class="section-title">All Internal Open Conditions:</div>
          <div>
            {{UWC.OPENINTERNAL}}
          </div>
        </div>
      </div>
      <hr class="divider" />
      <div style="padding: 16px 32px; color: #888; font-size: 13px; background: #f6f8fa;">
        This is an automated message from Vellum. Please do not reply directly to this email.
      </div>
    </div>
  </body>
</html>',
    'internal'
)
ON CONFLICT (template_id) 
DO UPDATE SET 
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    notification_type = EXCLUDED.notification_type; 