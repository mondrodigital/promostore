import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const MARKETING_EMAIL = 'marketing@vellummortgage.com'

serve(async (req) => {
  // Ensure API key is available
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set in environment variables.')
    return new Response('Internal Server Error: Missing API Key', { status: 500 })
  }

  const resend = new Resend(RESEND_API_KEY)

  // Extract order data from the request body
  // You might need to adjust this based on how you send data
  let orderData = { orderId: 'N/A', customerName: 'N/A' }
  try {
    const body = await req.json()
    // Basic validation/structure check
    if (body && typeof body === 'object') {
      orderData = {
        orderId: body.orderId || 'N/A',
        customerName: body.customerName || 'N/A',
        // Add other relevant order details you want in the email
      }
    }
  } catch (error) {
    console.error('Error parsing request body:', error)
    // Decide if you want to proceed with default data or return an error
    // return new Response('Bad Request: Invalid JSON', { status: 400 });
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Vellum Orders <orders@updates.govellum.com>',
      to: [MARKETING_EMAIL],
      subject: `New Order Placed: ${orderData.orderId}`,
      html: `
        <h1>New Order Notification</h1>
        <p>A new order has been placed.</p>
        <p><strong>Order ID:</strong> ${orderData.orderId}</p>
        <p><strong>Customer Name:</strong> ${orderData.customerName}</p>
        ${/* Add more order details here */ ''}
        <p>Please check the admin panel for full details.</p>
      `,
      // You can also add text: '...' for a plain text version
    })

    if (error) {
      console.error('Error sending email via Resend:', error)
      return new Response(`Internal Server Error: ${error.message}`, { status: 500 })
    }

    console.log('Email sent successfully:', data)
    return new Response(JSON.stringify({ message: 'Notification email sent successfully', data }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Failed to send email:', error)
    return new Response(`Internal Server Error: ${error.message || 'Unknown error'}`, { status: 500 })
  }
}) 