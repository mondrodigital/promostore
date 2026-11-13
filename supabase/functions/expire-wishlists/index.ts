// supabase/functions/expire-wishlists/index.ts
//
// Scheduled (pg_cron) edge function that:
//   1. Finds wishlist_requests with status='pending' whose expires_at is in
//      the past, and flips them to status='expired'.
//   2. Sends each affected LO an email letting them know the request expired
//      and inviting them to resubmit.
//   3. Sets expired_notified_at on successful email send.
//
// Idempotency: rows already expired AND notified (expired_notified_at set)
// are skipped. Rows that were marked expired but the email failed will be
// retried on the next run (status='expired' AND expired_notified_at IS NULL).
//
// Manual triggering: POST {} with the service role key works for local
// testing. The cron SQL snippet lives in
// supabase/migrations/20260516160100_add_wishlist_expiry.sql.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { Resend } from 'npm:resend';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface WishlistRow {
  id: number;
  order_id: string;
  user_name: string;
  user_email: string;
  item_id: string;
  requested_quantity: number;
  requested_pickup_date: string | null;
  requested_return_date: string | null;
  created_at: string;
  expires_at: string;
  status: string;
  expired_notified_at: string | null;
  promo_items?: { name?: string | null } | null;
}

function buildExpiryEmail(row: WishlistRow): { subject: string; html: string } {
  const itemName = row.promo_items?.name ?? 'a wishlist item';
  const pickupStr = row.requested_pickup_date
    ? new Date(row.requested_pickup_date).toLocaleDateString('en-US')
    : null;
  const returnStr = row.requested_return_date
    ? new Date(row.requested_return_date).toLocaleDateString('en-US')
    : null;

  const subject = `Your wishlist request for ${itemName} has expired`;

  const html = `
    <p>Hi ${row.user_name || 'there'},</p>
    <p>Your wishlist request for <strong>${itemName}</strong>${
    row.requested_quantity ? ` (qty ${row.requested_quantity})` : ''
  } has expired without becoming available.</p>
    ${
      pickupStr && returnStr
        ? `<p>Originally requested for pickup ${pickupStr} – ${returnStr}.</p>`
        : ''
    }
    <p>If you still need this item, please submit a new request on the
    <a href="https://eventitemstore.vercel.app">Vellum Event Items Store</a>.
    We'll keep an eye out and let you know if it comes back in stock.</p>
    <p>Thanks,<br>Vellum Event Items Store</p>
  `;

  return { subject, html };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('PROJECT_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('PROJECT_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'RESEND_API_KEY missing' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
  const resend = new Resend(RESEND_API_KEY);

  const summary = {
    newlyExpired: 0,
    emailed: 0,
    emailFailures: 0,
    alreadyExpiredPendingNotify: 0,
    errors: [] as string[],
  };

  try {
    // ---- Phase 1: flip pending → expired for anything past expires_at -----
    const nowIso = new Date().toISOString();

    const { data: newlyExpired, error: updateError } = await supabaseAdmin
      .from('wishlist_requests')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', nowIso)
      .select(
        'id, order_id, user_name, user_email, item_id, requested_quantity, requested_pickup_date, requested_return_date, created_at, expires_at, status, expired_notified_at',
      );

    if (updateError) {
      throw new Error(`Failed to flip rows to expired: ${updateError.message}`);
    }
    summary.newlyExpired = newlyExpired?.length ?? 0;

    // ---- Phase 2: pick up any rows that are expired but un-notified -------
    // (newlyExpired ∪ previously expired with null expired_notified_at).
    const { data: pendingNotify, error: notifyFetchError } = await supabaseAdmin
      .from('wishlist_requests')
      .select(
        'id, order_id, user_name, user_email, item_id, requested_quantity, requested_pickup_date, requested_return_date, created_at, expires_at, status, expired_notified_at',
      )
      .eq('status', 'expired')
      .is('expired_notified_at', null);

    if (notifyFetchError) {
      throw new Error(`Failed to load expired rows for notify: ${notifyFetchError.message}`);
    }

    const rows = (pendingNotify ?? []) as WishlistRow[];
    summary.alreadyExpiredPendingNotify = rows.length - summary.newlyExpired;

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, summary }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Look up item names so the email reads naturally.
    const itemIds = [...new Set(rows.map((r) => r.item_id))];
    const { data: items } = await supabaseAdmin
      .from('promo_items')
      .select('id, name')
      .in('id', itemIds);
    const itemNameById = new Map<string, string>(
      (items ?? []).map((i: { id: string; name: string }) => [i.id, i.name]),
    );
    for (const r of rows) {
      r.promo_items = { name: itemNameById.get(r.item_id) ?? null };
    }

    // ---- Phase 3: send LO email per row, mark notified on success --------
    for (const row of rows) {
      if (!row.user_email) {
        summary.emailFailures++;
        summary.errors.push(`row ${row.id}: missing user_email`);
        continue;
      }

      const { subject, html } = buildExpiryEmail(row);

      try {
        const { error: sendError } = await resend.emails.send({
          from: 'Vellum Orders <orders@updates.govellum.com>',
          replyTo: 'marketing@vellummortgage.com',
          to: [row.user_email],
          subject,
          html,
        });
        if (sendError) {
          throw sendError;
        }

        const { error: markError } = await supabaseAdmin
          .from('wishlist_requests')
          .update({ expired_notified_at: new Date().toISOString() })
          .eq('id', row.id);

        if (markError) {
          summary.emailFailures++;
          summary.errors.push(
            `row ${row.id}: email sent but failed to mark expired_notified_at: ${markError.message}`,
          );
        } else {
          summary.emailed++;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        summary.emailFailures++;
        summary.errors.push(`row ${row.id}: email failed: ${message}`);
        console.error(`expire-wishlists: failed for row ${row.id}: ${message}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, summary }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('expire-wishlists error:', message);
    return new Response(
      JSON.stringify({ ok: false, error: message, summary }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
