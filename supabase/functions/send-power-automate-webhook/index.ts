import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  deliverPowerAutomateWebhook,
  type PowerAutomatePayload,
} from '../_shared/power-automate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('PROJECT_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const payload = (await req.json()) as PowerAutomatePayload;
    console.log('send-power-automate-webhook received payload:', payload);

    const result = await deliverPowerAutomateWebhook(supabaseAdmin, payload);

    return new Response(
      JSON.stringify({
        success: result.success,
        attempts: result.attempts,
        status: result.status,
        powerAutomateResponse: result.responseText,
        error: result.errorMessage,
      }),
      {
        status: result.success ? 200 : 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('send-power-automate-webhook unexpected error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
});
