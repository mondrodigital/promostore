import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

// Define CORS headers (same as the other function)
const allowedOrigins = [
  'http://localhost:5173', // Local dev
  'https://eventitemstore.vercel.app', // Production
  // Add any other origins if needed
];

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin ?? '') ? origin : '', // Dynamically set allowed origin
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin', // Important for caching based on Origin
});

serve(async (req) => {
  const requestOrigin = req.headers.get('Origin');
  // Create base headers object using the function
  const baseHeaders = new Headers(corsHeaders(requestOrigin) as HeadersInit); 

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: baseHeaders })
  }
  
  // Append Content-Type for actual responses
  baseHeaders.append('Content-Type', 'application/json');

  // --- Create Supabase Admin Client --- 
  const supabaseAdmin = createClient(
    Deno.env.get('PROJECT_SUPABASE_URL') ?? '',
    Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  // --- End Supabase Admin Client --- 

  // Ensure API key is available
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set in environment variables.')
    // Use the Headers object
    return new Response(JSON.stringify({ message: 'Internal Server Error: Missing API Key' }), {
      status: 500,
      headers: baseHeaders
    })
  }

  const resend = new Resend(RESEND_API_KEY)

  // Extract order data from the request body
  let orderData = {
    orderId: 'N/A',
    customerName: 'N/A',
    customerEmail: '', // Expecting this from the body
    pickupDate: 'N/A',
    returnDate: 'N/A',
    items: [] as { name: string; quantity: number }[]
  }

  try {
    const body = await req.json()
    console.log('Received body for user confirmation:', body); // Logging for debugging

    if (body && typeof body === 'object' && body.customerEmail) { // Ensure customerEmail is present
      orderData = {
        orderId: body.orderId || 'N/A',
        customerName: body.customerName || 'N/A',
        customerEmail: body.customerEmail, // Use the email from the body
        pickupDate: body.pickupDate || 'N/A',
        returnDate: body.returnDate || 'N/A',
        items: Array.isArray(body.items) ? body.items : []
      }
    } else {
      throw new Error("Missing required data, especially customerEmail.");
    }
  } catch (error) {
    console.error('Error parsing request body:', error)
    // Use the Headers object
    return new Response(JSON.stringify({ message: `Bad Request: ${error.message}` }), {
      status: 400,
      headers: baseHeaders 
    })
  }

  try {
    // --- Fetch Email Settings from DB --- 
    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from('email_settings')
      .select('subject, body_html') // Don't need recipient for this one
      .eq('template_id', 'user_confirmation')
      .single()

    if (settingsError || !settingsData) {
      console.error('Error fetching user confirmation settings:', settingsError)
      // Use the Headers object
      return new Response(JSON.stringify({ message: 'Could not load email settings.' }), {
        status: 500, 
        headers: baseHeaders
      });
    }

    const { subject: subjectTemplate, body_html: bodyTemplate } = settingsData;
    if (!subjectTemplate || !bodyTemplate) {
        // Use the Headers object
        return new Response(JSON.stringify({ message: 'Missing required fields in user confirmation settings.' }), {
          status: 500, 
          headers: baseHeaders
        });
    }
    // --- End Fetch Email Settings --- 

    // Generate HTML for items list
    const itemsHtml = orderData.items.length > 0
      ? `<ul>${orderData.items.map(item => `<li>${item.name} (Qty: ${item.quantity})</li>`).join('')}</ul>`
      : '<p>No items specified.</p>';

    // --- Replace Placeholders --- 
    const replacements = {
      '{orderId}': orderData.orderId,
      '{customerName}': orderData.customerName,
      '{customerEmail}': orderData.customerEmail,
      '{pickupDate}': orderData.pickupDate,
      '{returnDate}': orderData.returnDate,
      '{itemsHtml}': itemsHtml,
    };

    let subject = subjectTemplate;
    let bodyHtml = bodyTemplate;
    for (const [key, value] of Object.entries(replacements)) {
      // Need to escape key for regex
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
      subject = subject.replace(new RegExp(escapedKey, 'g'), value || 'N/A');
      bodyHtml = bodyHtml.replace(new RegExp(escapedKey, 'g'), value || 'N/A');
    }
    // --- End Replace Placeholders --- 

    const { data, error } = await resend.emails.send({
      from: 'Vellum Orders <orders@updates.govellum.com>',
      to: [orderData.customerEmail], // Send to the customer email from request body
      subject: subject, // Use processed subject
      html: bodyHtml, // Use processed HTML
    })

    if (error) {
      throw error; // Let the catch block handle Resend errors
    }

    console.log('User confirmation email sent successfully:', data)
    // Use the Headers object
    return new Response(JSON.stringify({ message: 'User confirmation email sent successfully', data }), {
      headers: baseHeaders, 
      status: 200,
    })

  } catch (error) {
    console.error('Failed to send user confirmation email:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Use the Headers object
    return new Response(JSON.stringify({ message: `Internal Server Error: ${errorMessage}` }), {
      status: 500,
      headers: baseHeaders 
    })
  }
}) 