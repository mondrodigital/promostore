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

// Function to generate iCalendar content
function generateICSContent({
  eventName,
  description,
  startTime,
  endTime,
  location,
  attendees,
}: {
  eventName: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location: string;
  attendees: string[];
}) {
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d+/g, '');
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vellum Event Items//Calendar Invite//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${formatDate(startTime)}`,
    `DTEND:${formatDate(endTime)}`,
    `SUMMARY:${eventName}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    ...attendees.map(email => `ATTENDEE;RSVP=TRUE;ROLE=REQ-PARTICIPANT:mailto:${email}`),
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'DTSTAMP:' + formatDate(new Date()),
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
}

serve(async (req) => {
  const requestOrigin = req.headers.get('Origin');
  const baseHeaders = new Headers(corsHeaders(requestOrigin));

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
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

  let eventData: any = {};
  try {
    eventData = await req.json()
    console.log('Received body for calendar invite:', eventData);
    if (!eventData.customerEmail) throw new Error("Missing customerEmail.");
    if (!eventData.eventType) throw new Error("Missing eventType.");
    if (!eventData.startTime) throw new Error("Missing startTime.");
    if (!eventData.endTime) throw new Error("Missing endTime.");
  } catch (error) {
    console.error('Error parsing request body:', error)
    return new Response(JSON.stringify({ message: `Bad Request: ${error.message}` }), { status: 400, headers: baseHeaders })
  }

  try {
    // Generate calendar invite content
    const eventName = eventData.eventType === 'pickup' 
      ? `Equipment Pickup - Order #${eventData.orderId}`
      : `Equipment Return - Order #${eventData.orderId}`;

    const description = eventData.eventType === 'pickup'
      ? `Please arrive at the specified time to pick up your equipment for order #${eventData.orderId}.`
      : `Please return your equipment for order #${eventData.orderId} at the specified time.`;

    const icsContent = generateICSContent({
      eventName,
      description,
      startTime: new Date(eventData.startTime),
      endTime: new Date(eventData.endTime),
      location: eventData.location || 'Vellum Marketing Office',
      attendees: [eventData.customerEmail, ...(eventData.additionalAttendees || [])],
    });

    // Send email with calendar invite
    const { data, error } = await resend.emails.send({
      from: 'Vellum Orders <orders@updates.govellum.com>',
      to: [eventData.customerEmail, ...(eventData.additionalAttendees || [])],
      subject: eventName,
      html: `
        <p>Dear ${eventData.customerName || 'Valued Customer'},</p>
        <p>Please find attached the calendar invite for your ${eventData.eventType === 'pickup' ? 'equipment pickup' : 'equipment return'}.</p>
        <p>Order ID: ${eventData.orderId}</p>
        <p>Date: ${new Date(eventData.startTime).toLocaleDateString()}</p>
        <p>Time: ${new Date(eventData.startTime).toLocaleTimeString()} - ${new Date(eventData.endTime).toLocaleTimeString()}</p>
        <p>Location: ${eventData.location || 'Vellum Marketing Office'}</p>
        <p>Best regards,<br>The Events Team</p>
      `,
      attachments: [{
        filename: 'calendar-invite.ics',
        content: icsContent,
      }],
    })

    if (error) throw error;

    console.log('Calendar invite sent successfully:', data)
    return new Response(JSON.stringify({ message: 'Calendar invite sent successfully', data }), { headers: baseHeaders, status: 200 })

  } catch (error) {
    console.error('Failed to send calendar invite:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ message: `Internal Server Error: ${errorMessage}` }), { status: 500, headers: baseHeaders })
  }
}) 