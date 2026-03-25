import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const headers = { ...corsHeaders, 'Content-Type': 'application/json' }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ message: 'Missing RESEND_API_KEY' }), {
      status: 500, headers
    })
  }

  const resend = new Resend(RESEND_API_KEY)

  let payload: {
    userName: string
    userEmail: string
    itemName: string
    requestedQuantity: number
    orderId: string
    orderNumber: string
    requestedPickupDate: string
    requestedReturnDate: string
  }

  try {
    const body = await req.json()

    if (!body?.userEmail || !body?.itemName) {
      throw new Error('Missing required fields: userEmail, itemName')
    }

    payload = {
      userName: body.userName || 'Valued Customer',
      userEmail: body.userEmail,
      itemName: body.itemName,
      requestedQuantity: body.requestedQuantity || 1,
      orderId: body.orderId || 'N/A',
      orderNumber: body.orderNumber || body.orderId || 'N/A',
      requestedPickupDate: body.requestedPickupDate || 'N/A',
      requestedReturnDate: body.requestedReturnDate || 'N/A',
    }
  } catch (error) {
    return new Response(JSON.stringify({ message: `Bad Request: ${error.message}` }), {
      status: 400, headers
    })
  }

  try {
    const formatDate = (dateStr: string) => {
      if (!dateStr || dateStr === 'N/A') return 'N/A'
      try {
        return new Date(dateStr).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      } catch {
        return dateStr
      }
    }

    const pickupFormatted = formatDate(payload.requestedPickupDate)
    const returnFormatted = formatDate(payload.requestedReturnDate)

    const subject = `Great News! "${payload.itemName}" Has Been Added to Your Order`

    const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f8;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #003656; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px;">Vellum Event Items</h1>
    </div>
    <div style="background-color: white; padding: 32px; border-radius: 0 0 12px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
      <p style="font-size: 16px; color: #333; margin-top: 0;">Hi ${payload.userName},</p>

      <p style="font-size: 16px; color: #333; line-height: 1.6;">
        Great news! <strong>${payload.itemName}</strong> has become available and we've added it to your order for pickup.
      </p>

      <div style="background-color: #f0f9ff; border-left: 4px solid #0075AE; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
        <h3 style="margin: 0 0 12px 0; color: #003656; font-size: 16px;">Order Details</h3>
        <table style="width: 100%; font-size: 14px; color: #444;">
          <tr>
            <td style="padding: 4px 0; font-weight: 600;">Order:</td>
            <td style="padding: 4px 0;">${payload.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-weight: 600;">Item:</td>
            <td style="padding: 4px 0;">${payload.itemName} (x${payload.requestedQuantity})</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-weight: 600;">Pickup Date:</td>
            <td style="padding: 4px 0;">${pickupFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-weight: 600;">Return Date:</td>
            <td style="padding: 4px 0;">${returnFormatted}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 16px; color: #333; line-height: 1.6;">
        No action is needed on your part — the item is already reserved for you. Just pick it up on your scheduled pickup date!
      </p>

      <p style="font-size: 14px; color: #666; line-height: 1.6; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee;">
        If you no longer need this item, please message
        <a href="mailto:marketing@vellummortgage.com" style="color: #0075AE; text-decoration: none; font-weight: 600;">marketing@vellummortgage.com</a>
        and we'll remove it from your order.
      </p>

      <p style="font-size: 14px; color: #999; margin-top: 24px; margin-bottom: 0;">
        — The Vellum Marketing Team
      </p>
    </div>
  </div>
</body>
</html>`

    const { data: resendData, error: resendError } = await resend.emails.send({
      from: 'Vellum Event Items Store <events@vellummortgage.com>',
      to: [payload.userEmail],
      subject,
      html: bodyHtml,
    })

    if (resendError) {
      throw resendError
    }

    return new Response(JSON.stringify({ message: 'Notification sent', data: resendData }), {
      headers, status: 200,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ message: `Error: ${msg}` }), {
      status: 500, headers
    })
  }
})
