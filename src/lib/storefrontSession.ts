/**
 * Storefront identity + request state lives outside Supabase Auth (guest email,
 * event details, cart). Logout / identity switches must clear all of it or the
 * next user inherits the previous LO's "On your order" badges, cart, and dates.
 */

export const STOREFRONT_CLEAR_EVENT = 'vellum:clear-storefront-session';

export const GUEST_EMAIL_STORAGE_KEY = 'vellum_guest_email';
export const GUEST_NAME_STORAGE_KEY = 'vellum_guest_name';
export const EVENT_DETAILS_SESSION_KEY = 'vellum_event_details_session';
export const CART_STORAGE_KEY = 'lo_cart_v1';
export const WISHLIST_STORAGE_KEY = 'lo_wishlist_v1';

export function clearStorefrontStorage(): void {
  try {
    localStorage.removeItem(GUEST_EMAIL_STORAGE_KEY);
    localStorage.removeItem(GUEST_NAME_STORAGE_KEY);
    localStorage.removeItem(CART_STORAGE_KEY);
    localStorage.removeItem(WISHLIST_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear storefront localStorage', err);
  }

  try {
    sessionStorage.removeItem(EVENT_DETAILS_SESSION_KEY);
  } catch (err) {
    console.error('Failed to clear storefront sessionStorage', err);
  }
}

/** Clears persisted storefront keys and notifies React contexts/pages to reset in-memory state. */
export function requestStorefrontSessionClear(): void {
  clearStorefrontStorage();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STOREFRONT_CLEAR_EVENT));
  }
}

export const isVellumEmail = (email: string) =>
  email.trim().toLowerCase().endsWith('@vellummortgage.com');
