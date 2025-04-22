import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RECIPIENT_EMAIL = 'marketing@vellummortgage.com'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow requests from any origin (replace '*' with your frontend URL for production)
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // Specify allowed methods
}

serve(async (req) => {
  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Ensure API key is available
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set in environment variables.')
    return new Response('Internal Server Error: Missing API Key', { 
      status: 500,
      // Add CORS headers to error responses
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }

  const resend = new Resend(RESEND_API_KEY)

  // Extract order data from the request body
  let orderData = {
    orderId: 'N/A',
    customerName: 'N/A',
    customerEmail: 'N/A',
    pickupDate: 'N/A',
    returnDate: 'N/A',
    items: [] as { name: string; quantity: number }[]
  }
  try {
    const body = await req.json()
    // Log the received body to debug
    console.log('Received body:', body); 

    // Basic validation/structure check
    if (body && typeof body === 'object') {
      orderData = {
        orderId: body.orderId || 'N/A',
        customerName: body.customerName || 'N/A',
        customerEmail: body.customerEmail || 'N/A',
        pickupDate: body.pickupDate || 'N/A',
        returnDate: body.returnDate || 'N/A',
        items: Array.isArray(body.items) ? body.items : []
      }
    }
  } catch (error) {
    console.error('Error parsing request body:', error)
    // Decide if you want to proceed with default data or return an error
    // return new Response('Bad Request: Invalid JSON', { status: 400 });
  }

  try {
    // Generate HTML for items list
    const itemsHtml = orderData.items.length > 0 
      ? `<ul>${orderData.items.map(item => `<li>${item.name} (Qty: ${item.quantity})</li>`).join('')}</ul>`
      : '<p>No items specified.</p>';

    const { data, error } = await resend.emails.send({
      from: 'Vellum Orders <orders@updates.govellum.com>',
      to: [RECIPIENT_EMAIL],
      subject: `New Order Placed: ${orderData.orderId}`,
      html: `
        <h1>New Order Notification</h1>
        <p>A new order has been placed.</p>
        <p><strong>Order ID:</strong> ${orderData.orderId}</p>
        <p><strong>Customer Name:</strong> ${orderData.customerName}</p>
        <p><strong>Customer Email:</strong> ${orderData.customerEmail}</p>
        <p><strong>Pickup Date:</strong> ${orderData.pickupDate}</p>
        <p><strong>Return Date:</strong> ${orderData.returnDate}</p>
        <h2>Items Ordered:</h2>
        ${itemsHtml}
        <p>Please check the admin panel for full details.</p>
      `,
      // You can also add text: '...' for a plain text version
    })

    if (error) {
      console.error('Error sending email via Resend:', error)
      return new Response(JSON.stringify({ message: `Failed to send email: ${error.message}` }), { 
        status: 500,
        // Add CORS headers to error responses
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Email sent successfully:', data)
    return new Response(JSON.stringify({ message: 'Notification email sent successfully', data }), {
      // Add CORS headers to success response
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 200,
    })

  } catch (error) {
    console.error('Failed to send email:', error)
    return new Response(JSON.stringify({ message: `Internal Server Error: ${error.message || 'Unknown error'}` }), { 
      status: 500,
      // Add CORS headers to error responses
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
}) 