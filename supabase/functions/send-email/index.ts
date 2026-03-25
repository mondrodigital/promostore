import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow requests from any origin (adjust for production)
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // Specify allowed methods
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
// Revert recipient back to original marketing email
const MARKETING_EMAIL = 'marketing@vellummortgage.com'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Ensure API key is available
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set in environment variables.')
    return new Response('Internal Server Error: Missing API Key', { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const resend = new Resend(RESEND_API_KEY)

  // Extract order data from the request body
  let orderData = { orderId: 'N/A', customerName: 'N/A' }
  try {
    const body = await req.json()
    if (body && typeof body === 'object') {
      orderData = {
        orderId: body.orderId || 'N/A',
        customerName: body.customerName || 'N/A',
      }
    }
  } catch (error) {
    console.error('Error parsing request body:', error)
    // Still attempt to send email but maybe log that body parsing failed
  }

  try {
    const { data, error } = await resend.emails.send({
      // Revert from address back to Resend testing default
      from: 'onboarding@resend.dev', 
      to: [MARKETING_EMAIL],
      subject: `New Order Placed: ${orderData.orderId}`,
      html: `
        <h1>New Order Notification</h1>
        <p>A new order has been placed.</p>
        <p><strong>Order ID:</strong> ${orderData.orderId}</p>
        <p><strong>Customer Name:</strong> ${orderData.customerName}</p>
        <p>Please check the admin panel for full details.</p>
      `,
    })

    if (error) {
      console.error('Error sending email via Resend:', error)
      return new Response(JSON.stringify({ error: `Resend error: ${error.message}` }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    console.log('Email sent successfully:', data)
    return new Response(JSON.stringify({ message: 'Notification email sent successfully', data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Failed to send email:', error)
    return new Response(JSON.stringify({ error: `Internal server error: ${error.message || 'Unknown error'}` }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})