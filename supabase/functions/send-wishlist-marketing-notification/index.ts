import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'
import { corsHeaders } from '../_shared/cors.ts' // Assuming you have a shared CORS setup

// --- Environment Variables ---
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const MARKETING_EMAIL_ADDRESS = Deno.env.get('MARKETING_EMAIL_ADDRESS') // Target email
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') // For request verification
// ---

// --- Basic Request Verification ---
// Extremely important to prevent unauthorized access
function isAuthorized(req: Request): boolean {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Denying request.");
    return false;
  }
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
     console.warn("Missing or invalid Authorization header.");
    return false;
  }
  const providedKey = authHeader.split(' ')[1];
  return providedKey === SUPABASE_SERVICE_ROLE_KEY;
}
// ---

serve(async (req) => {
  // --- CORS Handling ---
  const requestOrigin = req.headers.get('Origin');
  const baseHeaders = new Headers(corsHeaders(requestOrigin) as HeadersInit);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: baseHeaders });
  }
  baseHeaders.append('Content-Type', 'application/json');
  // ---

  // --- Authorization Check ---
   if (!isAuthorized(req)) {
      console.error('Unauthorized attempt to access send-wishlist-marketing-notification function.');
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: baseHeaders,
      });
   }
  // ---

  // --- Resend Client & Marketing Email Setup ---
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set.')
    return new Response(JSON.stringify({ message: 'Internal Server Error: Missing Resend API Key' }), { status: 500, headers: baseHeaders })
  }
   if (!MARKETING_EMAIL_ADDRESS) {
     console.error('MARKETING_EMAIL_ADDRESS environment variable is not set.')
     // Don't send email, but maybe return success to the DB function? Or error? Depends on requirements.
     // For now, let's return an error.
     return new Response(JSON.stringify({ message: 'Internal Server Error: Missing Marketing Email Address Configuration' }), { status: 500, headers: baseHeaders })
   }
  const resend = new Resend(RESEND_API_KEY)
  // ---

  // --- Process Request Body ---
   let payload: {
     marketingEmail: string; // This might be redundant if fetched from env vars, but good for logging
     customerEmail: string;
     customerName: string;
     orderId: number | string;
     itemName: string;
     itemQuantity: number;
     pickupDate: string;
     returnDate: string;
     wishlistCreatedAt: string; // Expecting ISO string or similar
   };

  try {
    const body = await req.json()
    console.log('Received payload for marketing wishlist notification:', body);

    // Basic validation
    if (!body || !body.customerEmail || !body.itemName || !body.itemQuantity || !body.orderId) {
      throw new Error("Missing required fields in request payload.");
    }
    payload = body;

    // Optional: Verify payload.marketingEmail matches env var if needed
    // if (payload.marketingEmail !== MARKETING_EMAIL_ADDRESS) { ... }

  } catch (error) {
    console.error('Error parsing request body:', error)
    return new Response(JSON.stringify({ message: `Bad Request: ${error.message}` }), {
      status: 400,
      headers: baseHeaders
    })
  }
  // ---

  // --- Format Email Content ---
  const subject = `[Wishlist Fulfillment] Item Added to Order #${payload.orderId}`;
  const bodyHtml = `
    <p>An item from a user's wishlist has become available and was automatically added to their pending order.</p>
    <hr>
    <p><strong>Order Details:</strong></p>
    <ul>
      <li><strong>Order ID:</strong> ${payload.orderId}</li>
      <li><strong>Customer Name:</strong> ${payload.customerName || 'N/A'}</li>
      <li><strong>Customer Email:</strong> ${payload.customerEmail}</li>
    </ul>
    <p><strong>Added Item Details:</strong></p>
    <ul>
      <li><strong>Item:</strong> ${payload.itemName}</li>
      <li><strong>Quantity:</strong> ${payload.itemQuantity}</li>
      <li><strong>Requested Pickup:</strong> ${payload.pickupDate}</li>
      <li><strong>Requested Return:</strong> ${payload.returnDate}</li>
      <li><strong>Original Wishlist Date:</strong> ${payload.wishlistCreatedAt}</li>
    </ul>
    <hr>
    <p>This is an automated notification.</p>
  `; // Customize as needed

  // --- Send Email ---
  try {
    const { data, error } = await resend.emails.send({
      from: 'Vellum Event Items Store Automation <events@vellummortgage.com>', // Use a specific 'from' if desired
      to: [MARKETING_EMAIL_ADDRESS], // Send to the configured marketing address
      subject: subject,
      html: bodyHtml,
    })

    if (error) {
      throw error; // Let the catch block handle Resend errors
    }

    console.log('Wishlist marketing notification email sent successfully:', data)
    return new Response(JSON.stringify({ message: 'Wishlist marketing notification email sent successfully', data }), {
      headers: baseHeaders,
      status: 200,
    })

  } catch (error) {
    console.error('Failed to send wishlist marketing notification email:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ message: `Internal Server Error: ${errorMessage}` }), {
      status: 500,
      headers: baseHeaders
    })
  }
}) 