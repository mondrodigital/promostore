import { supabase } from '../lib/supabase';
import type { CartItem, PromoItem } from '../types';

export interface OrderFormData {
  name: string;
  email: string;
  pickupDate: Date | null;
  returnDate: Date | null;
  eventStartDate: Date | null;
  eventEndDate: Date | null;
}

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

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validates that all cart items are still available with requested quantities
 */
export async function validateCartAvailability(cartItems: CartItem[]): Promise<ValidationResult> {
  if (cartItems.length === 0) {
    return { isValid: true, staleItems: [], unavailableItems: [] };
  }

  const itemIds = cartItems.map(item => item.id);
  
  const { data: currentItems, error } = await supabase
    .from('promo_items')
    .select('id, available_quantity, name')
    .in('id', itemIds);

  if (error) {
    throw new Error(`Failed to validate cart: ${error.message}`);
  }

  const staleItems: StaleCartItem[] = [];
  const unavailableItems: CartItem[] = [];

  cartItems.forEach(cartItem => {
    const currentItem = currentItems?.find(item => item.id === cartItem.id);
    
    if (!currentItem) {
      unavailableItems.push(cartItem);
    } else if (currentItem.available_quantity === 0) {
      unavailableItems.push(cartItem);
    } else if (currentItem.available_quantity < cartItem.requestedQuantity) {
      staleItems.push({
        item: cartItem,
        currentAvailable: currentItem.available_quantity,
        requestedQuantity: cartItem.requestedQuantity
      });
    }
  });

  return {
    isValid: staleItems.length === 0 && unavailableItems.length === 0,
    staleItems,
    unavailableItems
  };
}

/**
 * Creates an order with checkouts atomically via a single database RPC.
 * Validates inventory, creates checkouts, and decrements quantities in one transaction.
 *
 * @param idempotencyKey - A UUID generated per cart-modal session. If the same key
 *   is submitted twice (e.g. a network retry), the RPC returns the existing order
 *   instead of creating a duplicate. Reset only after a successful submission.
 */
export async function createOrderAtomic(
  formData: OrderFormData,
  cartItems: CartItem[],
  status: 'pending' | 'wishlist_only' = 'pending',
  idempotencyKey?: string,
): Promise<{ orderId: string; orderNumber: string | null }> {
  const items = cartItems.map(item => ({
    item_id: item.id,
    quantity: item.requestedQuantity
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

  if (data && data.success === false) {
    throw new Error(data.message || 'Order creation failed');
  }

  return {
    orderId: data.order_id,
    orderNumber: data.order_number || null
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
    status: 'pending'
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
    wishlistItems: wishlistItems.map(item => ({ name: item.name, quantity: item.requestedQuantity }))
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
    eventEndDate: formData.eventEndDate ? formatDateLocal(formData.eventEndDate) : null
  };

  try {
    await supabase.functions.invoke('send-power-automate-webhook', { body: powerAutomatePayload });
  } catch (e) {
    console.error('Power Automate webhook failed:', e);
  }
}
