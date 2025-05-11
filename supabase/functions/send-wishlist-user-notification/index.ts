import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { Resend } from 'npm:resend'
import { corsHeaders } from '../_shared/cors.ts' // Assuming you have a shared CORS setup

// --- Environment Variables ---
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
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
     console.error('Unauthorized attempt to access send-wishlist-user-notification function.');
     return new Response(JSON.stringify({ message: 'Unauthorized' }), {
       status: 401,
       headers: baseHeaders,
     });
  }
  // ---

  // --- Resend Client Setup ---
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set.')
    return new Response(JSON.stringify({ message: 'Internal Server Error: Missing API Key' }), {
      status: 500,
      headers: baseHeaders
    })
  }
  const resend = new Resend(RESEND_API_KEY)
  // ---

  // --- Process Request Body ---
  let payload: {
    customerEmail: string;
    customerName: string;
    orderId: number | string;
    itemName: string;
    itemQuantity: number;
    pickupDate: string; // Expecting ISO string or similar
    returnDate: string; // Expecting ISO string or similar
  };

  try {
    const body = await req.json()
    console.log('Received payload for user wishlist notification:', body);

    // Basic validation
    if (!body || !body.customerEmail || !body.itemName || !body.itemQuantity || !body.orderId) {
      throw new Error("Missing required fields in request payload.");
    }
    payload = body;

  } catch (error) {
    console.error('Error parsing request body:', error)
    return new Response(JSON.stringify({ message: `Bad Request: ${error.message}` }), {
      status: 400,
      headers: baseHeaders
    })
  }
  // ---

  // --- Format Email Content ---
  // TODO: Consider fetching dynamic templates from DB (like in send-user-confirmation)
  const subject = `Good News! ${payload.itemName} from your wishlist is available!`;
  const bodyHtml = `
    <p>Hi ${payload.customerName || 'there'},</p>
    <p>Great news! The following item you had on your wishlist for order #${payload.orderId} is now available for your requested dates (${payload.pickupDate} to ${payload.returnDate}) and has been added to your order:</p>
    <ul>
      <li><strong>Item:</strong> ${payload.itemName}</li>
      <li><strong>Quantity:</strong> ${payload.itemQuantity}</li>
    </ul>
    <p>This item will now be included when you pick up your order. You can view your updated order details if needed.</p>
    <p>Thanks,<br>Vellum Event Items Store</p>
  `; // Replace with your actual branding/content/link to order view

  // --- Send Email ---
  try {
    const { data, error } = await resend.emails.send({
      from: 'Vellum Event Items Store <events@vellummortgage.com>', // Replace with your 'from' address
      to: [payload.customerEmail],
      subject: subject,
      html: bodyHtml,
    })

    if (error) {
      throw error; // Let the catch block handle Resend errors
    }

    console.log('Wishlist user notification email sent successfully:', data)
    return new Response(JSON.stringify({ message: 'Wishlist user notification email sent successfully', data }), {
      headers: baseHeaders,
      status: 200,
    })

  } catch (error) {
    console.error('Failed to send wishlist user notification email:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ message: `Internal Server Error: ${errorMessage}` }), {
      status: 500,
      headers: baseHeaders
    })
  }
}) 