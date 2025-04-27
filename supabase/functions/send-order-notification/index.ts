import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

// Define CORS headers
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
  // Use service_role key to bypass RLS for fetching settings
  // Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Edge Function secrets
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

  // Updated structure to expect checkedOutItems and wishlistItems
  let requestPayload = {
    orderId: 'N/A',
    customerName: 'N/A',
    customerEmail: 'N/A',
    pickupDate: 'N/A',
    returnDate: 'N/A',
    eventStartDate: 'N/A',
    eventEndDate: 'N/A',
    checkedOutItems: [] as { name: string; quantity: number }[],
    wishlistItems: [] as { name: string; quantity: number }[]
  }
  try {
    const body = await req.json()
    console.log('Received body for order notification:', body); 

    if (body && typeof body === 'object') {
      requestPayload = {
        orderId: body.orderId || null, // Keep null if no order ID
        customerName: body.customerName || 'N/A',
        customerEmail: body.customerEmail || 'N/A',
        pickupDate: body.pickupDate || 'N/A',
        returnDate: body.returnDate || 'N/A',
        eventStartDate: body.eventStartDate || 'N/A',
        eventEndDate: body.eventEndDate || 'N/A',
        checkedOutItems: Array.isArray(body.checkedOutItems) ? body.checkedOutItems : [],
        wishlistItems: Array.isArray(body.wishlistItems) ? body.wishlistItems : []
      }
    } else {
      // If payload is invalid, maybe still send a basic notification?
      console.warn('Received potentially invalid payload for order notification');
      // Keep default payload or throw error - deciding to proceed with defaults/parsed data
    }
  } catch (error) {
    console.error('Error parsing request body for order notification:', error)
    // Proceed with default data or return error? Proceeding for now.
  }

  try {
    // --- Fetch Email Settings from DB --- 
    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from('email_settings')
      .select('subject_template, body_template')
      .eq('setting_name', 'order_notification')
      .single()

    if (settingsError || !settingsData) {
      console.error('Error fetching order notification settings:', settingsError)
      // Use the Headers object
      return new Response(JSON.stringify({ message: 'Could not load email settings.' }), { 
        status: 500, 
        headers: baseHeaders
      });
    }

    const { subject_template: subjectTemplate, body_template: bodyTemplate } = settingsData;
    if (!subjectTemplate || !bodyTemplate) {
        // Use the Headers object
        return new Response(JSON.stringify({ message: 'Missing required fields in order notification settings.' }), { 
          status: 500, 
          headers: baseHeaders 
        });
    }
    // --- End Fetch Email Settings --- 

    // --- Generate HTML for Item Lists (similar to user confirmation) --- 
    const generateItemsHtml = (items: { name: string; quantity: number }[]) => {
      return items.length > 0
        ? `<ul style="list-style-type: none; padding: 0;">${items.map(item => 
            `<li style="padding: 8px 0; border-bottom: 1px solid #eee;">
              ${item.name} (Qty: ${item.quantity})
             </li>`).join('')}</ul>`
        : ''; // Return empty string if no items
    };

    const checkedOutItemsHtml = generateItemsHtml(requestPayload.checkedOutItems);
    const wishlistItemsHtml = generateItemsHtml(requestPayload.wishlistItems);

    // --- Create Wishlist Section (Conditionally) --- 
    let wishlistSectionHtml = '';
    if (requestPayload.wishlistItems.length > 0) {
      wishlistSectionHtml = `
        <h3 style="color: #333; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">
          Wishlist Items Requested
        </h3>
        <p style="font-size: 0.9em; color: #555; margin-bottom: 15px;">
          The user also requested the following items which were unavailable (saved to wishlist):
        </p>
        ${wishlistItemsHtml}
      `;
    }

    // --- Format Dates (Add if needed, or use strings directly) --- 
    // Reuse formatDate from user confirmation if complex formatting is desired
    const formatDate = (dateStr: string) => {
      if (!dateStr || dateStr === 'N/A') return 'N/A';
      try {
        // Simple Locale Date String for internal notification is likely fine
        return new Date(dateStr).toLocaleDateString('en-US'); 
      } catch (e) {
        return dateStr; // Fallback to original string
      }
    };

    // --- Replace Placeholders --- 
    const replacements = {
      '{{orderId}}': requestPayload.orderId || 'N/A',
      '{{customerName}}': requestPayload.customerName,
      '{{customerEmail}}': requestPayload.customerEmail,
      '{{pickupDate}}': formatDate(requestPayload.pickupDate),
      '{{returnDate}}': formatDate(requestPayload.returnDate),
      '{{eventStartDate}}': formatDate(requestPayload.eventStartDate),
      '{{eventEndDate}}': formatDate(requestPayload.eventEndDate),
      // Use the specific HTML for checked out items
      '{{checkedOutItems}}': checkedOutItemsHtml || '<p>No items were checked out in this request.</p>', 
      // Add the new wishlist section placeholder
      '{{wishlistSection}}': wishlistSectionHtml, 
    };

    let subject = subjectTemplate;
    let bodyHtml = bodyTemplate;
    for (const [key, value] of Object.entries(replacements)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const replacementValue = (value !== null && value !== undefined) ? String(value) : '';
      subject = subject.replace(new RegExp(escapedKey, 'g'), replacementValue);
      bodyHtml = bodyHtml.replace(new RegExp(escapedKey, 'g'), replacementValue);
    }
    // --- End Replace Placeholders --- 

    const { data, error } = await resend.emails.send({
      from: 'Vellum Event Items Store <events@vellummortgage.com>',
      to: ['marketing@vellummortgage.com'], // Keep destination as marketing
      subject: subject,
      html: bodyHtml, // Use the processed HTML
    })

    if (error) {
      console.error('Error sending email via Resend:', error)
      // Use the Headers object
      return new Response(JSON.stringify({ message: `Failed to send email: ${error.message}` }), { 
        status: 500,
        headers: baseHeaders
      })
    }

    console.log('Email sent successfully:', data)
    // Use the Headers object
    return new Response(JSON.stringify({ message: 'Notification email sent successfully', data }), {
      headers: baseHeaders, 
      status: 200,
    })

  } catch (error) {
    console.error('Failed to send email:', error)
    // Use the Headers object
    return new Response(JSON.stringify({ message: `Internal Server Error: ${error.message || 'Unknown error'}` }), { 
      status: 500,
      headers: baseHeaders 
    })
  }
}) 