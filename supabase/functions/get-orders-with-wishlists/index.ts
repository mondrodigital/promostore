import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// CORS configuration - allows multiple localhost ports
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
    return new Response(null, { 
      headers: corsHeaders(origin),
      status: 204 
    });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Check for email filter parameter (for user-specific order history)
    const url = new URL(req.url);
    const emailFilter = url.searchParams.get('email');
    
    // Build query
    let ordersQuery = supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    // If email filter provided, only return orders for that user
    if (emailFilter) {
      ordersQuery = ordersQuery.ilike('user_email', emailFilter);
    }
    
    // Get orders
    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) {
      throw new Error(`Orders fetch failed: ${ordersError.message}`);
    }

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json'
        }
      });
    }

    const orderIds = orders.map(order => order.id);

    // Get checkout items (the simple way)
    let checkoutItems = [];
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
        checkoutItems = checkouts;
      }
    } catch (err) {
      // Checkout fetch failed, continuing without checkout items
    }

    // Get wishlist items
    let wishlistItems = [];
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
          requested_return_date,
          created_at,
          expires_at,
          expired_notified_at
        `)
        .in('order_id', orderIds);

      if (!wishlistError && wishlists) {
        // Manually join with promo_items data
        const itemIds = [...new Set(wishlists.map(w => w.item_id))];
        const { data: items } = await supabaseAdmin
          .from('promo_items')
          .select('id, name, image_url, description, available_quantity')
          .in('id', itemIds);

        wishlistItems = wishlists.map(wishlist => ({
          ...wishlist,
          promo_items: items?.find(item => item.id === wishlist.item_id) || null,
        }));
      }
    } catch (err) {
      // Wishlist fetch failed, continuing without wishlist items
    }

    // Build the result
    const result = orders.map(order => {
      // Find checkout items for this order
      const orderCheckouts = checkoutItems
        .filter(checkout => checkout.order_id === order.id)
        .map(checkout => ({
          id: checkout.id,
          item: checkout.promo_items,
          quantity: checkout.quantity
        }));

      // Find wishlist items for this order  
      const orderWishlists = wishlistItems
        .filter(wishlist => wishlist.order_id === order.id)
        .map(wishlist => ({
          wishlist_request_id: String(wishlist.id),
          item: wishlist.promo_items,
          quantity: wishlist.requested_quantity,
          status: wishlist.status,
          requested_pickup_date: wishlist.requested_pickup_date || null,
          requested_return_date: wishlist.requested_return_date || null,
          created_at: wishlist.created_at || null,
          expires_at: wishlist.expires_at || null,
          expired_notified_at: wishlist.expired_notified_at || null,
          isWishlistItem: true
        }));



      return {
        ...order,
        items: orderCheckouts,
        associatedWishlistItems: orderWishlists
      };
    });

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json'
      },
      status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error'
    }), {
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
 