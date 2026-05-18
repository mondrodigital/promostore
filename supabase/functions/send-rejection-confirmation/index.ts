import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
  'http://localhost:5180',
  'https://eventitemstore.vercel.app',
]

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin ?? '') ? origin! : allowedOrigins[0],
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

  const supabaseAdmin = createClient(
    Deno.env.get('PROJECT_SUPABASE_URL') ?? '',
    Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set')
    return new Response(
      JSON.stringify({ message: 'Internal Server Error: Missing API Key' }),
      { status: 500, headers: baseHeaders }
    )
  }

  const resend = new Resend(RESEND_API_KEY)

  let orderData: {
    orderId?: string
    customerName?: string
    customerEmail?: string
    rejectionReason?: string
  } = {}

  try {
    orderData = await req.json()
    console.log('Received body for rejection confirmation:', orderData)
    if (!orderData.customerEmail) throw new Error('Missing customerEmail.')
  } catch (error) {
    console.error('Error parsing request body:', error)
    return new Response(
      JSON.stringify({ message: `Bad Request: ${error.message}` }),
      { status: 400, headers: baseHeaders }
    )
  }

  try {
    // Try to load a rejection template; fall back to a built-in template if none exists
    const { data: settingsData } = await supabaseAdmin
      .from('email_settings')
      .select('subject, body_html')
      .eq('template_id', 'order_rejected')
      .single()

    let subject: string
    let bodyHtml: string

    if (settingsData?.subject && settingsData?.body_html) {
      subject = settingsData.subject
      bodyHtml = settingsData.body_html

      const replacements: Record<string, string> = {
        '{orderId}':         orderData.orderId        || 'N/A',
        '{customerName}':    orderData.customerName   || 'N/A',
        '{rejectionReason}': orderData.rejectionReason || 'No reason provided',
      }

      for (const [key, value] of Object.entries(replacements)) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        subject  = subject.replace(new RegExp(escapedKey, 'g'), value)
        bodyHtml = bodyHtml.replace(new RegExp(escapedKey, 'g'), value)
      }
    } else {
      // Built-in fallback template
      subject = `Your order ${orderData.orderId || ''} has been declined`
      bodyHtml = `
        <p>Hi ${orderData.customerName || 'there'},</p>
        <p>Unfortunately, your order <strong>${orderData.orderId || ''}</strong> has been declined.</p>
        ${orderData.rejectionReason
          ? `<p><strong>Reason:</strong> ${orderData.rejectionReason}</p>`
          : ''}
        <p>If you have questions, please contact the event team.</p>
        <p>— Vellum Events Team</p>
      `
    }

    const { data, error } = await resend.emails.send({
      from:    'Vellum Orders <orders@updates.govellum.com>',
      replyTo: 'marketing@vellummortgage.com',
      to:      [orderData.customerEmail!],
      subject,
      html:    bodyHtml,
    })

    if (error) throw error

    console.log('Rejection confirmation email sent successfully:', data)
    return new Response(
      JSON.stringify({ message: 'Rejection confirmation email sent successfully', data }),
      { headers: baseHeaders, status: 200 }
    )
  } catch (error) {
    console.error('Failed to send rejection confirmation email:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ message: `Internal Server Error: ${errorMessage}` }),
      { status: 500, headers: baseHeaders }
    )
  }
})
