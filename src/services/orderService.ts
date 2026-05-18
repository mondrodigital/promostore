import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import type { CartItem } from '../types';

export interface OrderFormData {
  name: string;
  email: string;
  pickupDate: Date | null;
  returnDate: Date | null;
  eventStartDate: Date | null;
  eventEndDate: Date | null;
}

// -----------------------------------------------------------------------------
// Cart validation result shape (used by HomePage to surface specific messages)
// -----------------------------------------------------------------------------
export interface StaleCartItem {
  item: CartItem;
  currentAvailable: number;
  requestedQuantity: number;
}

export interface ValidationResult {
  isValid: boolean;
  staleItems: StaleCartItem[];
  unavailableItems: CartItem[];
}

// -----------------------------------------------------------------------------
// Date-aware availability helpers (backed by the new SQL functions)
// -----------------------------------------------------------------------------
export interface DateAwareAvailability {
  itemId: string;
  totalQuantity: number;
  availableQuantity: number;
}

export interface ItemConflictRange {
  checkoutDate: string;
  returnDate: string;
  quantity: number;
}

/** Active checkout the same user already holds for an item in a date window. */
export interface UserExistingReservation {
  itemId: string;
  orderId: string;
  orderNumber: string | null;
  checkoutDate: string;
  returnDate: string;
  status: string;
  quantity: number;
}

// -----------------------------------------------------------------------------
// create_order_with_checkouts RPC contract
//
// The Postgres function returns one of these shapes (see migration
// 20260516000000_date_aware_availability.sql for the source of truth).
// -----------------------------------------------------------------------------
export interface InsufficientStockConflict {
  item_id: string;
  item_name: string;
  requested: number;
  available: number;
}

export interface OrderRpcSuccess {
  success: true;
  order_id: string;
  order_number: string;
  message: string;
}

export interface OrderRpcInsufficientStock {
  success: false;
  code: 'INSUFFICIENT_STOCK';
  message: string;
  conflicts: InsufficientStockConflict[];
}

export type OrderRpcResponse = OrderRpcSuccess | OrderRpcInsufficientStock;

/**
 * Thrown by createOrderAtomic when the RPC reports stock conflicts. Carries the
 * structured `conflicts` array so the caller can render per-item messaging.
 */
export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK' as const;
  readonly conflicts: InsufficientStockConflict[];

  constructor(message: string, conflicts: InsufficientStockConflict[]) {
    super(message);
    this.name = 'InsufficientStockError';
    this.conflicts = conflicts;
  }
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// -----------------------------------------------------------------------------
// Bulk date-aware availability (powers Inventory cards + cart pre-validation)
// -----------------------------------------------------------------------------
export async function fetchAvailabilityForDates(
  itemIds: string[],
  startDate: Date,
  endDate: Date
): Promise<DateAwareAvailability[]> {
  if (itemIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_available_quantities_bulk', {
    p_item_ids: itemIds,
    p_start: formatDateLocal(startDate),
    p_end: formatDateLocal(endDate),
  });

  if (error) {
    throw new Error(`Failed to fetch availability: ${error.message}`);
  }

  return (data ?? []).map((row: { item_id: string; total_quantity: number; available_quantity: number }) => ({
    itemId: row.item_id,
    totalQuantity: row.total_quantity,
    availableQuantity: row.available_quantity,
  }));
}

// -----------------------------------------------------------------------------
// Per-item conflict ranges (powers #18 "why unavailable" and #9 overlap notes).
// Returns ONLY dates + aggregated quantity, never user/order identifiers.
// -----------------------------------------------------------------------------
export async function fetchItemConflicts(
  itemId: string,
  startDate: Date,
  endDate: Date
): Promise<ItemConflictRange[]> {
  const { data, error } = await supabase.rpc('get_item_conflicts', {
    p_item_id: itemId,
    p_start: formatDateLocal(startDate),
    p_end: formatDateLocal(endDate),
  });

  if (error) {
    throw new Error(`Failed to fetch conflicts: ${error.message}`);
  }

  return (data ?? []).map((row: { checkout_date: string; return_date: string; quantity: number }) => ({
    checkoutDate: row.checkout_date,
    returnDate: row.return_date,
    quantity: row.quantity,
  }));
}

/**
 * Returns active (pending / picked_up) checkouts for this email that overlap the
 * given window — used to block wishlisting an item the user already reserved.
 */
export async function fetchUserReservationsForWindow(
  userEmail: string,
  startDate: Date,
  endDate: Date,
): Promise<UserExistingReservation[]> {
  const trimmed = userEmail.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase.rpc('get_user_reservations_for_window', {
    p_user_email: trimmed,
    p_start: formatDateLocal(startDate),
    p_end: formatDateLocal(endDate),
  });

  if (error) {
    console.error('Failed to fetch user reservations', error);
    return [];
  }

  return (data ?? []).map(
    (row: {
      item_id: string;
      order_id: string;
      order_number: string | null;
      checkout_date: string;
      return_date: string;
      status: string;
      quantity: number;
    }) => ({
      itemId: row.item_id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      checkoutDate: row.checkout_date,
      returnDate: row.return_date,
      status: row.status,
      quantity: row.quantity,
    }),
  );
}

export async function findUserOverlappingReservation(
  userEmail: string,
  itemId: string,
  startDate: Date,
  endDate: Date,
): Promise<UserExistingReservation | null> {
  const trimmed = userEmail.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase.rpc('get_user_overlapping_reservations', {
    p_user_email: trimmed,
    p_item_id: itemId,
    p_start: formatDateLocal(startDate),
    p_end: formatDateLocal(endDate),
  });

  if (error) {
    console.error('Failed to check user reservation overlap', error);
    return null;
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    itemId,
    orderId: row.order_id,
    orderNumber: row.order_number,
    checkoutDate: row.checkout_date,
    returnDate: row.return_date,
    status: row.status,
    quantity: row.quantity,
  };
}

export function formatReservationMessage(
  reservation: UserExistingReservation,
  itemName?: string,
): string {
  const label = itemName ? `${itemName}: ` : '';
  const orderRef = reservation.orderNumber || 'your existing order';
  const pickup = format(parseISO(reservation.checkoutDate), 'MMM d');
  const returnD = format(parseISO(reservation.returnDate), 'MMM d, yyyy');
  return `${label}You already have this on order ${orderRef} (${pickup} – ${returnD}).`;
}

/**
 * Filters wishlist items the user already holds on an active order for overlapping dates.
 */
export async function filterWishlistBlockedByOwnReservation(
  wishlistItems: CartItem[],
  userEmail: string,
  pickupDate: Date,
  returnDate: Date,
): Promise<{ allowed: CartItem[]; blocked: Array<{ item: CartItem; reservation: UserExistingReservation }> }> {
  const blocked: Array<{ item: CartItem; reservation: UserExistingReservation }> = [];
  const allowed: CartItem[] = [];

  for (const item of wishlistItems) {
    const reservation = await findUserOverlappingReservation(
      userEmail,
      String(item.id),
      pickupDate,
      returnDate,
    );
    if (reservation) {
      blocked.push({ item, reservation });
    } else {
      allowed.push(item);
    }
  }

  return { allowed, blocked };
}

/**
 * Validates that all cart items are still available with requested quantities
 * for the chosen pickup/return window. Falls back to the static
 * `available_quantity` snapshot only when no dates have been selected yet
 * (e.g. very early in the flow before dates are picked).
 */
export async function validateCartAvailability(
  cartItems: CartItem[],
  pickupDate?: Date | null,
  returnDate?: Date | null
): Promise<ValidationResult> {
  if (cartItems.length === 0) {
    return { isValid: true, staleItems: [], unavailableItems: [] };
  }

  const itemIds = cartItems.map(item => String(item.id));

  type AvailabilityRow = { id: string; available: number; total: number };
  let availabilityRows: AvailabilityRow[];

  if (pickupDate && returnDate) {
    const dateAware = await fetchAvailabilityForDates(itemIds, pickupDate, returnDate);
    availabilityRows = dateAware.map(row => ({
      id: row.itemId,
      available: row.availableQuantity,
      total: row.totalQuantity,
    }));
  } else {
    // Pre-date fallback: use the legacy static snapshot.
    const { data: currentItems, error } = await supabase
      .from('promo_items')
      .select('id, available_quantity, total_quantity')
      .in('id', itemIds);

    if (error) {
      throw new Error(`Failed to validate cart: ${error.message}`);
    }

    availabilityRows = (currentItems ?? []).map(item => ({
      id: item.id,
      available: item.available_quantity,
      total: item.total_quantity,
    }));
  }

  const staleItems: StaleCartItem[] = [];
  const unavailableItems: CartItem[] = [];

  cartItems.forEach(cartItem => {
    const currentItem = availabilityRows.find(item => item.id === String(cartItem.id));

    if (!currentItem) {
      unavailableItems.push(cartItem);
    } else if (currentItem.available <= 0) {
      unavailableItems.push(cartItem);
    } else if (currentItem.available < cartItem.requestedQuantity) {
      staleItems.push({
        item: cartItem,
        currentAvailable: currentItem.available,
        requestedQuantity: cartItem.requestedQuantity,
      });
    }
  });

  return {
    isValid: staleItems.length === 0 && unavailableItems.length === 0,
    staleItems,
    unavailableItems,
  };
}

/**
 * Creates an order with checkouts atomically via a single database RPC.
 * Validates inventory, creates checkouts, and decrements quantities in one transaction.
 *
 * @param idempotencyKey - A UUID generated per cart-modal session. If the same key
 *   is submitted twice (e.g. a network retry), the RPC returns the existing order
 *   instead of creating a duplicate. Reset only after a successful submission.
 *
 * Throws:
 *   - InsufficientStockError when the server detects a date-aware stock
 *     conflict (issue #14). Caller should branch on this and surface a
 *     per-item adjusted-cart message (issue #17).
 *   - Error for any other failure (validation / network / etc.)
 */
export async function createOrderAtomic(
  formData: OrderFormData,
  cartItems: CartItem[],
  status: 'pending' | 'wishlist_only' = 'pending',
  idempotencyKey?: string,
): Promise<{ orderId: string; orderNumber: string | null }> {
  const items = cartItems.map(item => ({
    item_id: item.id,
    quantity: item.requestedQuantity,
  }));

  const { data, error } = await supabase.rpc('create_order_with_checkouts', {
    p_user_name: formData.name,
    p_user_email: formData.email,
    p_checkout_date: formData.pickupDate ? formatDateLocal(formData.pickupDate) : '',
    p_return_date: formData.returnDate ? formatDateLocal(formData.returnDate) : '',
    p_event_start_date: formData.eventStartDate ? formatDateLocal(formData.eventStartDate) : null,
    p_event_end_date: formData.eventEndDate ? formatDateLocal(formData.eventEndDate) : null,
    p_items: items,
    p_status: status,
    p_idempotency_key: idempotencyKey ?? null,
  });

  if (error) {
    throw new Error(`Order creation failed: ${error.message}`);
  }

  const response = data as OrderRpcResponse | null;

  if (!response) {
    throw new Error('Order creation failed: empty response from server');
  }

  if (response.success === false) {
    if (response.code === 'INSUFFICIENT_STOCK') {
      throw new InsufficientStockError(response.message, response.conflicts ?? []);
    }
    throw new Error(response.message || 'Order creation failed');
  }

  return {
    orderId: response.order_id,
    orderNumber: response.order_number || null,
  };
}

/**
 * Saves wishlist items to the database
 */
export async function saveWishlistItems(
  orderId: string,
  wishlistItems: CartItem[],
  formData: OrderFormData
): Promise<void> {
  const wishlistRequestsPayload = wishlistItems.map(item => ({
    user_name: formData.name,
    user_email: formData.email,
    order_id: orderId,
    item_id: item.id,
    requested_quantity: item.requestedQuantity,
    requested_pickup_date: formatDateLocal(formData.pickupDate!),
    requested_return_date: formatDateLocal(formData.returnDate!),
    event_start_date: formatDateLocal(formData.eventStartDate!),
    event_end_date: formatDateLocal(formData.eventEndDate!),
    status: 'pending',
  }));

  const { error: wishlistError } = await supabase.rpc(
    'add_wishlist_requests',
    { requests: wishlistRequestsPayload }
  );

  if (wishlistError) {
    throw new Error(`Failed to save wishlist request: ${wishlistError.message}`);
  }
}

/**
 * Sends notifications for the order
 */
export async function sendOrderNotifications(
  orderId: string,
  orderNumber: string | null,
  formData: OrderFormData,
  cartItems: CartItem[],
  wishlistItems: CartItem[]
): Promise<void> {
  const notificationPayload = {
    orderId: orderNumber || orderId || 'N/A',
    customerName: formData.name,
    customerEmail: formData.email,
    pickupDate: formData.pickupDate?.toLocaleDateString(),
    returnDate: formData.returnDate?.toLocaleDateString(),
    eventStartDate: formData.eventStartDate?.toLocaleDateString(),
    eventEndDate: formData.eventEndDate?.toLocaleDateString(),
    checkedOutItems: cartItems.map(item => ({ name: item.name, quantity: item.requestedQuantity })),
    wishlistItems: wishlistItems.map(item => ({ name: item.name, quantity: item.requestedQuantity })),
  };

  try {
    await supabase.functions.invoke('send-order-notification', { body: notificationPayload });
  } catch (e) {
    console.error('Failed to send admin notification:', e);
  }

  try {
    await supabase.functions.invoke('send-user-confirmation', { body: notificationPayload });
  } catch (e) {
    console.error('Failed to send user confirmation:', e);
  }
}

/**
 * Sends Power Automate webhook
 */
export async function sendPowerAutomateWebhook(
  orderId: string,
  orderNumber: string | null,
  formData: OrderFormData
): Promise<void> {
  const powerAutomatePayload = {
    orderId: orderNumber || orderId,
    customerName: formData.name,
    customerEmail: formData.email,
    pickupDate: formData.pickupDate ? formatDateLocal(formData.pickupDate) : null,
    returnDate: formData.returnDate ? formatDateLocal(formData.returnDate) : null,
    eventStartDate: formData.eventStartDate ? formatDateLocal(formData.eventStartDate) : null,
    eventEndDate: formData.eventEndDate ? formatDateLocal(formData.eventEndDate) : null,
  };

  try {
    await supabase.functions.invoke('send-power-automate-webhook', { body: powerAutomatePayload });
  } catch (e) {
    console.error('Power Automate webhook failed:', e);
  }
}
