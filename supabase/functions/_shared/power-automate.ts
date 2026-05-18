// supabase/functions/_shared/power-automate.ts
//
// Shared Power Automate webhook delivery logic used by both:
//   - send-power-automate-webhook  (called at order-creation time)
//   - retry-order-notification     (called by admin UI for failed orders)
//
// Behaviour
// ---------
// - Three attempts max with exponential backoff: ~1s, 3s, 10s.
// - Every attempt updates the orders row so the admin UI reflects state.
// - On success, sets notification_status='sent', clears last_error.
// - On final failure, sets notification_status='failed' and stores the last
//   error message so the admin can see why it failed.
// - Defensive: if the order row can't be loaded (e.g. unknown identifier) we
//   still attempt the webhook so we don't block delivery — we just skip the
//   DB tracking.

// The webhook URL lived hardcoded in the original send-power-automate-webhook
// function. Keeping it here (still overridable via env) avoids any behavioural
// drift while letting future deploys swap it without code changes.
const FALLBACK_WEBHOOK_URL =
  'https://defaultc0ced471202d4d63b96319c9821d50.c7.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/0dfbaaa1c2b443999557006fbfd5dbc2/triggers/manual/paths/invoke/?api-version=1&tenantId=tId&environmentId=Default-c0ced471-202d-4d63-b963-19c9821d50c7&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=R89nz1jC5Av8ZAQENcxG9YZrqFImY1KR6isKN8UPZGk';

export const POWER_AUTOMATE_WEBHOOK_URL =
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Deno?.env?.get?.('POWER_AUTOMATE_WEBHOOK_URL') ??
  FALLBACK_WEBHOOK_URL;

// Matches the existing client payload shape from src/services/orderService.ts.
export interface PowerAutomatePayload {
  orderId: string | number | null | undefined;
  customerName?: string;
  customerEmail?: string;
  pickupDate?: string | null;
  returnDate?: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
}

export interface DeliveryResult {
  success: boolean;
  attempts: number;
  status: number | null;
  responseText: string | null;
  errorMessage: string | null;
}

// Backoff delays in ms between attempts: before attempt 2, before attempt 3.
const BACKOFF_DELAYS_MS = [1_000, 3_000, 10_000];
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface SupabaseLikeClient {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

/**
 * Resolve an orders.id (uuid) from whatever identifier the client sent us.
 * The client passes `orderNumber || orderId`, so we accept either.
 * Returns null if no order can be found — caller still delivers the webhook
 * but skips DB tracking.
 */
export async function resolveOrderUuid(
  supabaseAdmin: SupabaseLikeClient,
  identifier: string | number | null | undefined,
): Promise<string | null> {
  if (!identifier) return null;
  const ident = String(identifier);

  // Try order_number first (cheap, indexed)
  const byOrderNumber = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('order_number', ident)
    .maybeSingle();

  if (byOrderNumber?.data?.id) return byOrderNumber.data.id as string;

  // Then try uuid id, but only if it looks like a uuid (avoids cast errors)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ident)) {
    const byId = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('id', ident)
      .maybeSingle();
    if (byId?.data?.id) return byId.data.id as string;
  }

  return null;
}

/**
 * Best-effort write to the orders.notification_* columns. Logs and swallows
 * errors so delivery itself is never blocked by a DB hiccup.
 */
async function updateOrderNotificationState(
  supabaseAdmin: SupabaseLikeClient,
  orderUuid: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!orderUuid) return;
  try {
    const { error } = await supabaseAdmin
      .from('orders')
      .update(patch)
      .eq('id', orderUuid);
    if (error) {
      console.warn('updateOrderNotificationState failed:', error.message);
    }
  } catch (e) {
    console.warn('updateOrderNotificationState threw:', e);
  }
}

/**
 * Deliver the Power Automate webhook with retry-with-exponential-backoff,
 * persisting per-attempt state into the orders row when we can identify it.
 */
export async function deliverPowerAutomateWebhook(
  supabaseAdmin: SupabaseLikeClient,
  payload: PowerAutomatePayload,
): Promise<DeliveryResult> {
  const orderUuid = await resolveOrderUuid(supabaseAdmin, payload.orderId);

  const webhookData = {
    orderId: payload.orderId,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    pickupDate: payload.pickupDate,
    returnDate: payload.returnDate,
    eventStartDate: payload.eventStartDate,
    eventEndDate: payload.eventEndDate,
  };

  let lastError: string | null = null;
  let lastStatus: number | null = null;
  let lastResponseText: string | null = null;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attemptsMade = attempt;

    // Mark retrying for every in-flight attempt so the admin UI shows live state.
    await updateOrderNotificationState(supabaseAdmin, orderUuid, {
      notification_status: 'retrying',
      notification_attempts: attempt,
      notification_last_attempt_at: new Date().toISOString(),
    });

    try {
      const response = await fetch(POWER_AUTOMATE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookData),
      });

      lastStatus = response.status;
      lastResponseText = await response.text().catch(() => null);

      if (response.ok) {
        await updateOrderNotificationState(supabaseAdmin, orderUuid, {
          notification_status: 'sent',
          notification_attempts: attempt,
          notification_last_error: null,
          notification_last_attempt_at: new Date().toISOString(),
        });
        console.log(
          `Power Automate webhook delivered on attempt ${attempt} (status ${response.status})`,
        );
        return {
          success: true,
          attempts: attempt,
          status: response.status,
          responseText: lastResponseText,
          errorMessage: null,
        };
      }

      lastError = `Power Automate responded ${response.status}: ${lastResponseText ?? '<no body>'}`;
      console.warn(`Power Automate attempt ${attempt} failed: ${lastError}`);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`Power Automate attempt ${attempt} threw: ${lastError}`);
    }

    // If we have another attempt left, persist the error and sleep before retry.
    if (attempt < MAX_ATTEMPTS) {
      await updateOrderNotificationState(supabaseAdmin, orderUuid, {
        notification_status: 'retrying',
        notification_attempts: attempt,
        notification_last_error: lastError,
        notification_last_attempt_at: new Date().toISOString(),
      });
      await sleep(BACKOFF_DELAYS_MS[attempt - 1] ?? 10_000);
    }
  }

  // Exhausted all attempts.
  await updateOrderNotificationState(supabaseAdmin, orderUuid, {
    notification_status: 'failed',
    notification_attempts: attemptsMade,
    notification_last_error: lastError,
    notification_last_attempt_at: new Date().toISOString(),
  });

  return {
    success: false,
    attempts: attemptsMade,
    status: lastStatus,
    responseText: lastResponseText,
    errorMessage: lastError,
  };
}
