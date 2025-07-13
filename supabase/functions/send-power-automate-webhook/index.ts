import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const POWER_AUTOMATE_WEBHOOK_URL = "https://defaultc0ced471202d4d63b96319c9821d50.c7.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/0dfbaaa1c2b443999557006fbfd5dbc2/triggers/manual/paths/invoke/?api-version=1&tenantId=tId&environmentId=Default-c0ced471-202d-4d63-b963-19c9821d50c7&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=R89nz1jC5Av8ZAQENcxG9YZrqFImY1KR6isKN8UPZGk";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const payload = await req.json();
    console.log('Received payload:', payload);
    
    // Clean, structured data for Power Automate
    const webhookData = {
      orderId: payload.orderId,
      customerName: payload.customerName,
      customerEmail: payload.customerEmail,
      pickupDate: payload.pickupDate,
      returnDate: payload.returnDate,
      eventStartDate: payload.eventStartDate,
      eventEndDate: payload.eventEndDate
    };

    console.log('Sending to Power Automate:', webhookData);

    // Send to Power Automate
    const response = await fetch(POWER_AUTOMATE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Power Automate error:', response.status, errorText);
      throw new Error(`Power Automate webhook failed: ${response.status} - ${errorText}`);
    }

    const result = await response.text();
    console.log('Power Automate success:', result);

    return new Response(JSON.stringify({
      success: true,
      powerAutomateResponse: result
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}); 