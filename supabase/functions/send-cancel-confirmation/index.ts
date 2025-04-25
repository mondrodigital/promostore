import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

// Define CORS headers 
const allowedOrigins = [
  'http://localhost:5173', // Local dev
  'https://eventitemstore.vercel.app', // Production
];
const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin ?? '') ? origin : allowedOrigins[0], 
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
});

serve(async (req) => {
  const requestOrigin = req.headers.get('Origin');
  const baseHeaders = new Headers(corsHeaders(requestOrigin));

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204, // Use 204 for preflight success
      headers: baseHeaders
    });
  }
  baseHeaders.append('Content-Type', 'application/json');

  const supabaseAdmin = createClient(
    Deno.env.get('PROJECT_SUPABASE_URL') ?? '',
    Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set')
    return new Response(JSON.stringify({ message: 'Internal Server Error: Missing API Key' }), { status: 500, headers: baseHeaders })
  }

  const resend = new Resend(RESEND_API_KEY)

  let orderData: any = {};
  try {
    orderData = await req.json()
    console.log('Received body for cancellation confirmation:', orderData);
    if (!orderData.customerEmail) throw new Error("Missing customerEmail.");
  } catch (error) {
    console.error('Error parsing request body:', error)
    return new Response(JSON.stringify({ message: `Bad Request: ${error.message}` }), { status: 400, headers: baseHeaders })
  }

  try {
    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from('email_settings')
      .select('subject_template, body_template')
      .eq('setting_name', 'order_cancelled')
      .single()

    if (settingsError || !settingsData) {
      console.error('Error fetching order_cancelled settings:', settingsError)
      return new Response(JSON.stringify({ message: 'Could not load email settings.' }), { 
        status: 500, 
        headers: baseHeaders 
      });
    }

    const { subject_template: subjectTemplate, body_template: bodyTemplate } = settingsData;
    if (!subjectTemplate || !bodyTemplate) {
      return new Response(JSON.stringify({ message: 'Missing required fields in order_cancelled settings.' }), { 
        status: 500, 
        headers: baseHeaders 
      });
    }

    // Fewer placeholders needed for this template
    const replacements = {
      '{orderId}': orderData.orderId || 'N/A',
      '{customerName}': orderData.customerName || 'N/A',
      // Add others here if they get added to the template later
    };

    let subject = subjectTemplate;
    let bodyHtml = bodyTemplate;
    for (const [key, value] of Object.entries(replacements)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      subject = subject.replace(new RegExp(escapedKey, 'g'), value || 'N/A');
      bodyHtml = bodyHtml.replace(new RegExp(escapedKey, 'g'), value || 'N/A');
    }

    const { data, error } = await resend.emails.send({
      from: 'Vellum Orders <orders@updates.govellum.com>',
      to: [orderData.customerEmail],
      subject: subject,
      html: bodyHtml,
    })

    if (error) throw error;

    console.log('Cancellation confirmation email sent successfully:', data)
    return new Response(JSON.stringify({ message: 'Cancellation confirmation email sent successfully', data }), { headers: baseHeaders, status: 200 })

  } catch (error) {
    console.error('Failed to send cancellation confirmation email:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ message: `Internal Server Error: ${errorMessage}` }), { status: 500, headers: baseHeaders })
  }
}) 