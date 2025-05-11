import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// --- IMPORTANT CONFIGURATION ---
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'YOUR_SUPABASE_URL';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'YOUR_SUPABASE_SERVICE_ROLE_KEY';
// --- End Type Definitions ---

// --- Helper function to create Headers object safely --- 
// (Assuming corsHeaders function exists in ../_shared/cors.ts)
const createSafeHeaders = (origin: string | null, contentType?: string): Headers => {
  const headers = new Headers();
  const cors = corsHeaders(origin); 
  for (const [key, value] of Object.entries(cors)) {
      if (value !== null) { headers.append(key, value); }
  }
  if (contentType) { headers.append('Content-Type', contentType); }
  return headers;
};
// --- End Helper --- 

console.log('Function get-orders-with-wishlists v2 initialized.');

serve(async (req) => {
  const origin = req.headers.get('Origin');
  // --- CORS Handling ---
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: createSafeHeaders(origin) }); // Use helper
  }
  // --- End CORS Handling ---

  try {
    // --- Initialize Supabase Admin Client --- 
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error("Supabase URL or Service Role Key is missing in environment variables.");
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    console.log('Supabase admin client initialized.');

    // --- 1. Fetch base orders --- 
    console.log('Fetching base orders...');
    const { data: ordersData, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        created_at,
        user_name,
        user_email,
        checkout_date,
        return_date,
        status
      `)
      .order('created_at', { ascending: false });

    if (ordersError) throw new Error(`Orders fetch error: ${ordersError.message}`);
    if (!ordersData) throw new Error("No orders data returned.");
    console.log(`Fetched ${ordersData.length} base orders.`);

    const orderIds = ordersData.map(o => o.id);
    if (orderIds.length === 0) { // No orders, return early
       return new Response(JSON.stringify([]), {
         headers: createSafeHeaders(origin, 'application/json'),
         status: 200
       });
    }

    // --- 2. Fetch associated checkouts separately --- 
    console.log('Fetching checkouts for order IDs:', orderIds);
    const { data: checkoutsData, error: checkoutsError } = await supabaseAdmin
      .from('checkouts')
      .select(`
        id, 
        order_id,
        item_id,
        quantity,
        item:promo_items (
          id,
          name,
          image_url,
          description,
          total_quantity,
          available_quantity
        )
      `)
      .in('order_id', orderIds);
    
    if (checkoutsError) throw new Error(`Checkouts fetch error: ${checkoutsError.message}`);
    console.log(`Fetched ${checkoutsData?.length ?? 0} checkouts.`);

    // --- 3. Fetch associated pending wishlist items separately --- 
    console.log('Fetching pending wishlist items for order IDs:', orderIds);
    const { data: wishlistData, error: wishlistError } = await supabaseAdmin
      .from('wishlist_requests')
      .select(`id, order_id, item_id, requested_quantity, status, item:promo_items (id, name, image_url, description, available_quantity)`)
      .in('order_id', orderIds);

    if (wishlistError) throw new Error(`Wishlist fetch error: ${wishlistError.message}`);
    console.log(`Fetched ${wishlistData?.length ?? 0} pending wishlist items.`);

    // --- 4. Manually merge data --- 
    console.log('Merging data...');
    const checkoutsByOrderId = new Map();
    if (checkoutsData) {
      for (const checkout of checkoutsData) {
        if (!checkoutsByOrderId.has(checkout.order_id)) {
          checkoutsByOrderId.set(checkout.order_id, []);
        }
        // Ensure the structure matches frontend expectation (CheckoutWithItem)
        checkoutsByOrderId.get(checkout.order_id).push({
          id: checkout.id,
          item: checkout.item, // Nested item object
          quantity: checkout.quantity 
          // Add other fields if your CheckoutWithItem type needs them
        });
      }
    }

    const wishlistByOrderId = new Map();
    if (wishlistData) {
      for (const wishlistItem of wishlistData) {
          if (!wishlistByOrderId.has(wishlistItem.order_id)) {
            wishlistByOrderId.set(wishlistItem.order_id, []);
          }
           // Ensure the structure matches frontend expectation (AssociatedWishlistItem)
          wishlistByOrderId.get(wishlistItem.order_id).push({
              wishlist_request_id: wishlistItem.id,
              item: wishlistItem.item,
              quantity: wishlistItem.requested_quantity,
              status: wishlistItem.status,
              isWishlistItem: true
          });
      }
    }

    const combinedOrders = ordersData.map(order => ({
        ...order,
        items: checkoutsByOrderId.get(order.id) || [],
        associatedWishlistItems: wishlistByOrderId.get(order.id) || []
    }));

    console.log('Merging complete.');

    // --- 5. Return combined data --- 
    return new Response(JSON.stringify(combinedOrders), {
      headers: createSafeHeaders(origin, 'application/json'),
      status: 200
    });

  } catch (error) {
    console.error("Error in get-orders-with-wishlists function v2:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: createSafeHeaders(origin, 'application/json'),
      status: 500
    });
  }
});
 