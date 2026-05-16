import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ADMIN_EMAIL = 'marketing@vellummortgage.com'

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://eventitemstore.vercel.app',
]

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin ?? '') ? (origin as string) : allowedOrigins[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
})

serve(async (req) => {
  const requestOrigin = req.headers.get('Origin')
  const baseHeaders = new Headers(corsHeaders(requestOrigin))

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders })
  }
  baseHeaders.append('Content-Type', 'application/json')

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set')
    return new Response(
      JSON.stringify({ message: 'Internal Server Error: Missing API Key' }),
      { status: 500, headers: baseHeaders }
    )
  }

  let body: {
    orderId?: string
    orderNumber?: string
    customerName?: string
    customerEmail?: string
    currentReturnDate?: string
    requestedReturnDate?: string
  }

  try {
    body = await req.json()
    if (!body.orderId || !body.customerEmail || !body.requestedReturnDate) {
      throw new Error('Missing required fields: orderId, customerEmail, requestedReturnDate')
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Invalid request body'
    return new Response(
      JSON.stringify({ message: `Bad Request: ${msg}` }),
      { status: 400, headers: baseHeaders }
    )
  }

  const resend = new Resend(RESEND_API_KEY)
  const displayId = body.orderNumber || body.orderId

  try {
    const { error } = await resend.emails.send({
      from: 'Vellum Orders <orders@updates.govellum.com>',
      replyTo: body.customerEmail,
      to: [ADMIN_EMAIL],
      subject: `Extension Request — ${displayId}`,
      html: `
        <h2 style="font-family:sans-serif;">Return Date Extension Request</h2>
        <table style="font-family:sans-serif;border-collapse:collapse;">
          <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Order</td><td>${displayId}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Customer</td><td>${body.customerName ?? 'N/A'} (${body.customerEmail})</td></tr>
          <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Current Return Date</td><td>${body.currentReturnDate ?? 'N/A'}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Requested New Return Date</td><td><strong>${body.requestedReturnDate}</strong></td></tr>
        </table>
        <p style="font-family:sans-serif;margin-top:16px;">Please update the return date in the admin dashboard if you approve this request.</p>
      `,
    })

    if (error) throw error

    console.log('Extension request sent for order', displayId)
    return new Response(
      JSON.stringify({ message: 'Extension request sent successfully' }),
      { status: 200, headers: baseHeaders }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Failed to send extension request email:', errorMessage)
    return new Response(
      JSON.stringify({ message: `Internal Server Error: ${errorMessage}` }),
      { status: 500, headers: baseHeaders }
    )
  }
})
