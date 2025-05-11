// supabase/functions/_shared/cors.ts

// Define allowed origins
const allowedOrigins = [
  'http://localhost:5173', // Local dev (adjust port if needed)
  'https://eventitemstore.vercel.app', // Production frontend URL
  // Add any other origins that need access
];

export const corsHeaders = (origin: string | null) => {
  const isAllowed = allowedOrigins.includes(origin ?? '');
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0], // Allow specific origin or fallback
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', // Allow POST for function calls, OPTIONS for preflight
    'Vary': 'Origin', // Important for caching based on Origin
  };
}; 