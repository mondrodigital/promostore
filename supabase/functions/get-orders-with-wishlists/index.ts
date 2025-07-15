import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  const origin = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    console.log('Fetching orders with items...');
    
    // Get orders
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Orders error:', ordersError);
      throw new Error(`Orders fetch failed: ${ordersError.message}`);
    }

    console.log(`Found ${orders?.length || 0} orders`);

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
      console.warn('Checkout fetch failed, continuing without checkout items:', err);
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
          item_id
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
          promo_items: items?.find(item => item.id === wishlist.item_id) || null
        }));
      }
    } catch (err) {
      console.warn('Wishlist fetch failed, continuing without wishlist items:', err);
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
          isWishlistItem: true
        }));

      return {
        ...order,
        items: orderCheckouts,
        associatedWishlistItems: orderWishlists
      };
    });

    console.log(`Returning ${result.length} orders with items`);

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error',
      details: 'Check logs for more info'
    }), {
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
 