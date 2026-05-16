import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
];

const corsHeaders = (origin: string | null) => {
  const isAllowed = origin && allowedOrigins.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin! : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin), status: 204 });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const url = new URL(req.url);
    const emailFilter = url.searchParams.get('email');

    // Pagination / filtering params (admin view only, ignored when emailFilter is set)
    const limitParam  = url.searchParams.get('limit')  ?? '50';
    const offsetParam = url.searchParams.get('offset') ?? '0';
    const statusParam = url.searchParams.get('status') ?? null; // e.g. 'pending'

    const limit  = Math.max(1, Math.min(200, parseInt(limitParam,  10) || 50));
    const offset = Math.max(0, parseInt(offsetParam, 10) || 0);

    // ----------------------------------------------------------------
    // User-specific history (called from OrderHistoryModal with ?email=)
    // Returns the legacy plain-array format for backward compatibility.
    // ----------------------------------------------------------------
    if (emailFilter) {
      const q = supabaseAdmin
        .from('orders')
        .select('*')
        .ilike('user_email', emailFilter)
        .order('created_at', { ascending: false });

      const { data: orders, error: ordersError } = await q;
      if (ordersError) throw new Error(`Orders fetch failed: ${ordersError.message}`);
      if (!orders || orders.length === 0) {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }

      const result = await buildOrdersResult(supabaseAdmin, orders);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ----------------------------------------------------------------
    // Admin view: paginated + optionally filtered by status.
    // Returns { orders: [...], total_count: number }.
    // ----------------------------------------------------------------

    // Count query (must match the filtered set)
    let countQuery = supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true });
    if (statusParam) {
      countQuery = countQuery.eq('status', statusParam);
    }
    const { count: totalCount, error: countError } = await countQuery;
    if (countError) throw new Error(`Count query failed: ${countError.message}`);

    // Data query with pagination
    let dataQuery = supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (statusParam) {
      dataQuery = dataQuery.eq('status', statusParam);
    }

    const { data: orders, error: ordersError } = await dataQuery;
    if (ordersError) throw new Error(`Orders fetch failed: ${ordersError.message}`);

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ orders: [], total_count: totalCount ?? 0 }), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const ordersWithDetails = await buildOrdersResult(supabaseAdmin, orders);

    return new Response(
      JSON.stringify({ orders: ordersWithDetails, total_count: totalCount ?? 0 }),
      {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// ----------------------------------------------------------------
// Shared helper: attach checkout + wishlist items to order rows
// ----------------------------------------------------------------
async function buildOrdersResult(
  supabaseAdmin: ReturnType<typeof createClient>,
  orders: Record<string, unknown>[]
) {
  const orderIds = orders.map((o) => (o as { id: string }).id);

  let checkoutItems: Record<string, unknown>[] = [];
  try {
    const { data: checkouts, error: checkoutError } = await supabaseAdmin
      .from('checkouts')
      .select(`
        id,
        order_id,
        quantity,
        promo_items (
          id,
          name,
          image_url,
          description,
          available_quantity
        )
      `)
      .in('order_id', orderIds);

    if (!checkoutError && checkouts) {
      checkoutItems = checkouts as Record<string, unknown>[];
    }
  } catch {
    // non-fatal
  }

  let wishlistItems: Record<string, unknown>[] = [];
  try {
    const { data: wishlists, error: wishlistError } = await supabaseAdmin
      .from('wishlist_requests')
      .select(`
        id,
        order_id,
        requested_quantity,
        status,
        item_id,
        requested_pickup_date,
        requested_return_date
      `)
      .in('order_id', orderIds);

    if (!wishlistError && wishlists) {
      const itemIds = [...new Set(wishlists.map((w) => (w as { item_id: string }).item_id))];
      const { data: items } = await supabaseAdmin
        .from('promo_items')
        .select('id, name, image_url, description, available_quantity')
        .in('id', itemIds);

      wishlistItems = wishlists.map((wishlist) => ({
        ...(wishlist as object),
        promo_items: items?.find(
          (item) => item.id === (wishlist as { item_id: string }).item_id
        ) || null,
      }));
    }
  } catch {
    // non-fatal
  }

  return orders.map((order) => {
    const o = order as { id: string };

    const orderCheckouts = (checkoutItems as { order_id: string; id: string; quantity: number; promo_items: unknown }[])
      .filter((c) => c.order_id === o.id)
      .map((c) => ({ id: c.id, item: c.promo_items, quantity: c.quantity }));

    const orderWishlists = (wishlistItems as {
      order_id: string;
      id: string | number;
      requested_quantity: number;
      status: string;
      requested_pickup_date: string | null;
      requested_return_date: string | null;
      promo_items: unknown;
    }[])
      .filter((w) => w.order_id === o.id)
      .map((w) => ({
        wishlist_request_id:  String(w.id),
        item:                 w.promo_items,
        quantity:             w.requested_quantity,
        status:               w.status,
        requested_pickup_date: w.requested_pickup_date || null,
        requested_return_date: w.requested_return_date || null,
        isWishlistItem:       true,
      }));

    return {
      ...order,
      items:                  orderCheckouts,
      associatedWishlistItems: orderWishlists,
    };
  });
}
