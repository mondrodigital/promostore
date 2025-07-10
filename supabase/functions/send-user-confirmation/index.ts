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

  // Updated structure to expect checkedOutItems and wishlistItems
  let requestPayload = {
    orderId: 'N/A',
    customerName: 'N/A',
    customerEmail: '',
    pickupDate: 'N/A',
    returnDate: 'N/A',
    eventStartDate: 'N/A',
    eventEndDate: 'N/A',
    checkedOutItems: [] as { name: string; quantity: number }[],
    wishlistItems: [] as { name: string; quantity: number }[]
  }

  try {
    const body = await req.json()
    console.log('Received body for user confirmation:', body); // Logging for debugging

    // Validate required fields and parse payload
    if (body && typeof body === 'object' && body.customerEmail) {
      requestPayload = {
        orderId: body.orderId || null, // Keep null if no order ID
        customerName: body.customerName || 'N/A',
        customerEmail: body.customerEmail,
        pickupDate: body.pickupDate || 'N/A',
        returnDate: body.returnDate || 'N/A',
        eventStartDate: body.eventStartDate || 'N/A',
        eventEndDate: body.eventEndDate || 'N/A',
        // Use the new keys from the payload
        checkedOutItems: Array.isArray(body.checkedOutItems) ? body.checkedOutItems : [],
        wishlistItems: Array.isArray(body.wishlistItems) ? body.wishlistItems : []
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
      .select('subject_template, body_template')
      .eq('setting_name', 'user_confirmation')
      .single()

    if (settingsError || !settingsData) {
      console.error('Error fetching user confirmation settings:', settingsError)
      // Use the Headers object
      return new Response(JSON.stringify({ message: 'Could not load email settings.' }), {
        status: 500, 
        headers: baseHeaders
      });
    }

    const { subject_template: subjectTemplate, body_template: bodyTemplate } = settingsData;
    if (!subjectTemplate || !bodyTemplate) {
        // Use the Headers object
        return new Response(JSON.stringify({ message: 'Missing required fields in user confirmation settings.' }), {
          status: 500, 
          headers: baseHeaders
        });
    }
    // --- End Fetch Email Settings --- 

    // --- Generate HTML for Item Lists --- 
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
          Items Added to Wishlist
        </h3>
        <p style="font-size: 0.9em; color: #555; margin-bottom: 15px;">
          These items are currently unavailable for your requested dates. We'll notify you if they become available.
        </p>
        ${wishlistItemsHtml}
      `;
    }

    // Format dates to be more readable
    const formatDate = (dateStr: string) => {
      if (!dateStr) return 'N/A';
      try {
        return new Date(dateStr).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch (e) {
        return dateStr;
      }
    };

    // --- Replace Placeholders --- 
    const replacements = {
      '{{orderId}}': requestPayload.orderId || 'N/A', // Handle potential null orderId
      '{{customerName}}': requestPayload.customerName,
      '{{customerEmail}}': requestPayload.customerEmail,
      '{{pickupDate}}': formatDate(requestPayload.pickupDate),
      '{{returnDate}}': formatDate(requestPayload.returnDate),
      '{{eventStartDate}}': formatDate(requestPayload.eventStartDate),
      '{{eventEndDate}}': formatDate(requestPayload.eventEndDate),
      // Use the specific HTML for checked out items
      '{{checkedOutItems}}': checkedOutItemsHtml || '<p>No items were checked out in this order.</p>', 
      // Add the new wishlist section placeholder
      '{{wishlistSection}}': wishlistSectionHtml, 
    };

    let subject = subjectTemplate;
    let bodyHtml = bodyTemplate;
    for (const [key, value] of Object.entries(replacements)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Ensure we replace with empty string if value is null/undefined, except for orderId
      const replacementValue = (value !== null && value !== undefined) ? String(value) : ''; 
      subject = subject.replace(new RegExp(escapedKey, 'g'), replacementValue);
      bodyHtml = bodyHtml.replace(new RegExp(escapedKey, 'g'), replacementValue);
    }
    // --- End Replace Placeholders --- 

    const { data, error } = await resend.emails.send({
      from: 'Vellum Event Items Store <events@vellummortgage.com>',
      to: [requestPayload.customerEmail],
      subject: subject,
      html: bodyHtml,
    })

    if (error) {
      throw error; // Let the catch block handle Resend errors
    }

    // Send calendar invites for pickup and return
    try {
      // Send pickup calendar invite
      const pickupStartTime = new Date(requestPayload.pickupDate);
      const pickupEndTime = new Date(pickupStartTime.getTime() + 60 * 60 * 1000); // 1 hour duration
      
      await supabaseAdmin.functions.invoke('send-calendar-invite', {
        body: {
          eventType: 'pickup',
          orderId: requestPayload.orderId,
          customerName: requestPayload.customerName,
          customerEmail: requestPayload.customerEmail,
          startTime: pickupStartTime.toISOString(),
          endTime: pickupEndTime.toISOString(),
          location: 'Vellum Marketing Office',
          additionalAttendees: ['marketing@vellummortgage.com']
        }
      });

      // Send return calendar invite
      const returnStartTime = new Date(requestPayload.returnDate);
      const returnEndTime = new Date(returnStartTime.getTime() + 60 * 60 * 1000); // 1 hour duration
      
      await supabaseAdmin.functions.invoke('send-calendar-invite', {
        body: {
          eventType: 'return',
          orderId: requestPayload.orderId,
          customerName: requestPayload.customerName,
          customerEmail: requestPayload.customerEmail,
          startTime: returnStartTime.toISOString(),
          endTime: returnEndTime.toISOString(),
          location: 'Vellum Marketing Office',
          additionalAttendees: ['marketing@vellummortgage.com']
        }
      });
    } catch (calendarError) {
      console.error('Failed to send calendar invites:', calendarError);
      // Don't throw the error - we still want to return success for the email
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