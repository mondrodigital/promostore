import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Rate limiting constants (adjust as needed)
const MAX_EMAILS_PER_INVOCATION = 5; // Process up to 5 emails per run
const DELAY_BETWEEN_EMAILS_MS = 600; // ~1.6 emails/sec (Resend free limit is 2/sec, plus burst)

// Function to introduce delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

console.log('Starting process-email-queue function');

// Helper function to create Headers object safely from corsHeaders result
const createSafeHeaders = (origin: string | null, contentType?: string): Headers => {
  const headers = new Headers();
  const cors = corsHeaders(origin);
  // Append CORS headers safely
  for (const [key, value] of Object.entries(cors)) {
      if (value !== null) { // Ensure value is not null before appending
          headers.append(key, value);
      }
  }
  // Append Content-Type if provided
  if (contentType) {
      headers.append('Content-Type', contentType);
  }
  return headers;
};

serve(async (req) => {
  const origin = req.headers.get('Origin');
  // --- CORS Handling (Optional for scheduled functions, but good practice) ---
  if (req.method === 'OPTIONS') {
    // Use helper function for OPTIONS response headers
    return new Response('ok', { headers: createSafeHeaders(origin) })
  }

  try {
    // --- Authorization Check (Important for scheduled functions) ---
    // Requires SUPABASE_SERVICE_ROLE_KEY
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
        console.warn('Unauthorized attempt to run process-email-queue.');
        // Use helper function for error response headers
        return new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: createSafeHeaders(origin, 'application/json'),
        });
    }
    console.log('Authorization successful.');

    // --- Supabase Admin Client --- 
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { fetch: fetch } } // Use standard fetch for edge functions
    )
    console.log('Supabase admin client created.');

    // --- Process the Queue --- 
    let processedCount = 0;
    let errorCount = 0;

    // 1. Select and Lock Pending Emails
    // Use FOR UPDATE SKIP LOCKED to handle concurrent runs (if scheduled frequently)
    const { data: pendingEmails, error: selectError } = await supabaseAdmin
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }) // Process oldest first
      .limit(MAX_EMAILS_PER_INVOCATION)
      .forUpdate({ skipLocked: true }); 

    if (selectError) {
      console.error('Error selecting pending emails:', selectError);
      throw new Error(`Failed to select pending emails: ${selectError.message}`);
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log('No pending emails found in the queue.');
      // Use helper function for success response headers
      return new Response(JSON.stringify({ message: 'No pending emails to process.' }), {
        status: 200,
        headers: createSafeHeaders(origin, 'application/json'),
      })
    }

    console.log(`Found ${pendingEmails.length} pending emails to process.`);

    // 2. Mark emails as 'processing' (optional, but good for visibility)
    const emailIds = pendingEmails.map(email => email.id);
    const { error: updateProcessingError } = await supabaseAdmin
        .from('email_queue')
        .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
        .in('id', emailIds);

    if (updateProcessingError) {
        console.error('Error marking emails as processing:', updateProcessingError);
        // Continue processing, but log the error
    }

    // 3. Iterate and Process Each Email
    for (const emailJob of pendingEmails) {
      let jobStatus: 'sent' | 'failed' = 'failed'; // Default to failed
      let errorMessage: string | null = null;

      try {
        console.log(`Processing email job ID: ${emailJob.id}, Type: ${emailJob.notification_type}`);

        // Determine which function to invoke based on type
        let targetFunction = '';
        switch (emailJob.notification_type) {
          case 'wishlist_user':
            targetFunction = 'send-wishlist-user-notification';
            break;
          case 'wishlist_marketing':
            targetFunction = 'send-wishlist-marketing-notification';
            break;
          // Add other cases for different notification types if needed
          default:
            throw new Error(`Unsupported notification type: ${emailJob.notification_type}`);
        }

        console.log(`Invoking function: ${targetFunction} for job ID: ${emailJob.id}`);
        // Invoke the specific email sending function
        const { error: invokeError } = await supabaseAdmin.functions.invoke(targetFunction, {
          body: emailJob.payload, // Pass the stored payload
        });

        if (invokeError) {
          // Handle specific errors? e.g., Resend rate limit error?
          console.error(`Error invoking ${targetFunction} for job ${emailJob.id}:`, invokeError);
          errorMessage = invokeError.message;
          jobStatus = 'failed';
          errorCount++;
        } else {
          console.log(`Successfully invoked ${targetFunction} for job ID: ${emailJob.id}`);
          jobStatus = 'sent';
          processedCount++;
        }

      } catch (processingError) {
        console.error(`Unhandled error processing job ${emailJob.id}:`, processingError);
        errorMessage = processingError.message;
        jobStatus = 'failed';
        errorCount++;
      } finally {
        // 4. Update Job Status in DB
        const updatePayload: { 
            status: 'sent' | 'failed'; 
            processed_at?: string; 
            error_message?: string | null; 
            retry_count?: number 
        } = {
            status: jobStatus,
            error_message: errorMessage,
        };
        if (jobStatus === 'sent') {
            updatePayload.processed_at = new Date().toISOString();
        } else {
             // Increment retry count on failure
             updatePayload.retry_count = (emailJob.retry_count || 0) + 1;
             // TODO: Add logic to handle max retries (e.g., move to a dead-letter queue or mark as permanently failed)
        }

        const { error: updateStatusError } = await supabaseAdmin
          .from('email_queue')
          .update(updatePayload)
          .eq('id', emailJob.id);

        if (updateStatusError) {
          console.error(`Failed to update status for job ${emailJob.id}:`, updateStatusError);
          // Log, but continue processing other emails
        }

        // 5. Add Delay before next email (if there are more)
        if (pendingEmails.indexOf(emailJob) < pendingEmails.length - 1) {
          console.log(`Waiting ${DELAY_BETWEEN_EMAILS_MS}ms before next email...`);
          await delay(DELAY_BETWEEN_EMAILS_MS);
        }
      }
    }

    console.log(`Finished processing batch. Success: ${processedCount}, Failures: ${errorCount}`);
    // Use helper function for success response headers
    return new Response(JSON.stringify({ message: `Processed ${processedCount} emails successfully, ${errorCount} failed.` }), {
      status: 200,
      headers: createSafeHeaders(origin, 'application/json'),
    });

  } catch (error) {
    console.error('Critical error in process-email-queue function:', error)
    // Use helper function for error response headers
    return new Response(JSON.stringify({ message: `Internal Server Error: ${error.message}` }), {
      status: 500,
      headers: createSafeHeaders(origin, 'application/json'),
    })
  }
}) 