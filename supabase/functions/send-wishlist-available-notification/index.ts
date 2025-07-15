import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Environment Variables ---
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const STORE_URL = Deno.env.get('SITE_URL') || 'https://eventitemstore.vercel.app' // Fallback URL

// --- CORS Setup (copy from other functions) ---
const allowedOrigins = [
  // Add origins if needed, though direct invocation might not require strict CORS
  // For direct function calls, Supabase handles auth via service key typically
];
const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': '*', // Allow all for simplicity, or restrict if needed
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

// --- Main Function Logic ---
serve(async (req) => {
  const requestOrigin = req.headers.get('Origin');
  const baseHeaders = new Headers(corsHeaders(requestOrigin) as HeadersInit);

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: baseHeaders })
  }

  baseHeaders.append('Content-Type', 'application/json');

  // --- Initialize Clients ---
  const supabaseAdmin = createClient(
    Deno.env.get('PROJECT_SUPABASE_URL') ?? '',
    Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  const resend = new Resend(RESEND_API_KEY)

  // --- API Key Check ---
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set.')
    return new Response(JSON.stringify({ message: 'Internal Server Error: Missing API Key' }), {
      status: 500, headers: baseHeaders
    })
  }

  // --- Parse Payload ---
  let payload = {
    requestId: null as number | null,
    userName: 'N/A',
    userEmail: '', // Required
    itemName: 'N/A',
    itemId: null as string | null, // Changed to string for UUID
    requestedQuantity: 1,
    requestedPickupDate: 'N/A',
    requestedReturnDate: 'N/A'
  };

  try {
    const body = await req.json()
    console.log('Received payload for wishlist notification:', body);

    if (body && typeof body === 'object' && body.userEmail && body.itemName) {
      payload = {
        requestId: body.requestId || null,
        userName: body.userName || 'N/A',
        userEmail: body.userEmail,
        itemName: body.itemName,
        itemId: body.itemId || null,
        requestedQuantity: body.requestedQuantity || 1,
        requestedPickupDate: body.requestedPickupDate || 'N/A',
        requestedReturnDate: body.requestedReturnDate || 'N/A'
      }
    } else {
      throw new Error("Missing required data (userEmail, itemName).");
    }
  } catch (error) {
    console.error('Error parsing request body for wishlist notification:', error)
    return new Response(JSON.stringify({ message: `Bad Request: ${error.message}` }), {
      status: 400, headers: baseHeaders
    })
  }

  // --- Send Email ---
  try {
    // Fetch the specific email template
    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from('email_settings')
      .select('subject, body_html')
      .eq('template_id', 'wishlist_available_notification') // Use the correct column name
      .single()

    if (settingsError || !settingsData) {
      throw new Error(`Could not load email settings for wishlist_available_notification: ${settingsError?.message}`);
    }
    const { subject: subjectTemplate, body_html: bodyTemplate } = settingsData;
    if (!subjectTemplate || !bodyTemplate) {
      throw new Error('Missing subject or body template in settings.');
    }

    // Format dates (optional, can adjust formatting)
    const formatDate = (dateStr: string) => {
        if (!dateStr || dateStr === 'N/A') return 'N/A';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch { return dateStr; }
    };

    // Replace placeholders
    const replacements = {
      '{{userName}}': payload.userName,
      '{{userEmail}}': payload.userEmail,
      '{{itemName}}': payload.itemName,
      '{{requestedQuantity}}': String(payload.requestedQuantity),
      '{{requestedPickupDate}}': formatDate(payload.requestedPickupDate),
      '{{requestedReturnDate}}': formatDate(payload.requestedReturnDate),
      '{{storeLink}}': STORE_URL, // Link back to the main store page
      // Add {{itemLink}} maybe? Construct URL like STORE_URL + /#item- + payload.itemId if desired
    };

    let subject = subjectTemplate;
    let bodyHtml = bodyTemplate;
    for (const [key, value] of Object.entries(replacements)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const replacementValue = (value !== null && value !== undefined) ? String(value) : '';
      subject = subject.replace(new RegExp(escapedKey, 'g'), replacementValue);
      bodyHtml = bodyHtml.replace(new RegExp(escapedKey, 'g'), replacementValue);
    }

    // Send email via Resend
    const { data: resendData, error: resendError } = await resend.emails.send({
      from: 'Vellum Event Items Store <events@vellummortgage.com>',
      to: [payload.userEmail],
      subject: subject,
      html: bodyHtml,
    })

    if (resendError) {
      throw resendError; // Let the catch block handle Resend errors
    }

    console.log('Wishlist available notification sent successfully:', resendData)
    return new Response(JSON.stringify({ message: 'Wishlist available notification sent successfully', data: resendData }), {
      headers: baseHeaders, status: 200,
    })

  } catch (error) {
    console.error('Failed to send wishlist available notification:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ message: `Internal Server Error: ${errorMessage}` }), {
      status: 500, headers: baseHeaders
    })
  }
}) 