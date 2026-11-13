// supabase/functions/retry-order-notification/index.ts
//
// Admin-triggered endpoint that re-attempts the Power Automate webhook for a
// single order. Body: { order_id: <uuid> }.
//
// Reuses the same retry-with-backoff logic as send-power-automate-webhook so
// the orders.notification_* columns end up in a consistent state.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  deliverPowerAutomateWebhook,
  type PowerAutomatePayload,
} from '../_shared/power-automate.ts';

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'https://eventitemstore.vercel.app',
];

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin ?? '')
    ? (origin as string)
    : allowedOrigins[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('en-US');
  } catch {
    return d;
  }
}

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const baseHeaders = new Headers(corsHeaders(origin) as HeadersInit);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: baseHeaders });
  }
  baseHeaders.append('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: baseHeaders,
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('PROJECT_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let body: { order_id?: string };
  try {
    body = await req.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Invalid JSON body: ${message}` }), {
      status: 400,
      headers: baseHeaders,
    });
  }

  const orderId = body.order_id;
  if (!orderId) {
    return new Response(JSON.stringify({ error: 'Missing order_id in request body' }), {
      status: 400,
      headers: baseHeaders,
    });
  }

  // Load the order so we can rebuild the original webhook payload.
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, user_name, user_email, checkout_date, return_date, event_start_date, event_end_date')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) {
    console.error('retry-order-notification: order lookup failed:', orderError.message);
    return new Response(
      JSON.stringify({ error: `Order lookup failed: ${orderError.message}` }),
      { status: 500, headers: baseHeaders },
    );
  }

  if (!order) {
    return new Response(JSON.stringify({ error: `Order ${orderId} not found` }), {
      status: 404,
      headers: baseHeaders,
    });
  }

  const payload: PowerAutomatePayload = {
    // Match the original client behaviour: prefer order_number, fall back to uuid.
    orderId: order.order_number ?? order.id,
    customerName: order.user_name,
    customerEmail: order.user_email,
    pickupDate: formatDate(order.checkout_date),
    returnDate: formatDate(order.return_date),
    eventStartDate: formatDate(order.event_start_date),
    eventEndDate: formatDate(order.event_end_date),
  };

  console.log(`retry-order-notification: retrying order ${order.id} (${order.order_number ?? '—'})`);

  const result = await deliverPowerAutomateWebhook(supabaseAdmin, payload);

  return new Response(
    JSON.stringify({
      success: result.success,
      attempts: result.attempts,
      status: result.status,
      powerAutomateResponse: result.responseText,
      error: result.errorMessage,
      order_id: order.id,
    }),
    {
      status: result.success ? 200 : 502,
      headers: baseHeaders,
    },
  );
});
