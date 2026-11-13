import { useEffect, useState, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Package2, X, CalendarRange } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useGuestUser } from '../context/GuestUserContext';
import { useToast } from '../context/ToastContext';
import type { PromoItem } from '../types';
import "react-datepicker/dist/react-datepicker.css";
import ItemCalendar from '../components/ItemCalendar';
import SimpleNavbar from '../components/SimpleNavbar';
import BottomRequestBar from '../components/BottomRequestBar';
import ItemFilterBar from '../components/ItemFilterBar';
import AvailabilityInfo from '../components/AvailabilityInfo';
import EventDetailsModal, { type EventDetailsFormData } from '../components/EventDetailsModal';
import {
  validateCartAvailability,
  createOrderAtomic,
  saveWishlistItems,
  sendOrderNotifications,
  sendPowerAutomateWebhook,
  fetchAvailabilityForDates,
  fetchUserReservationsForWindow,
  filterWishlistBlockedByOwnReservation,
  formatReservationMessage,
  InsufficientStockError,
  type OrderFormData,
  type DateAwareAvailability,
  type UserExistingReservation,
} from '../services/orderService';
import {
  EVENT_DETAILS_SESSION_KEY,
  STOREFRONT_CLEAR_EVENT,
  isVellumEmail,
} from '../lib/storefrontSession';

// Seconds to disable the submit button after any submission attempt (success or failure).
// Prevents accidental double-clicks and rapid-fire retries from the UI.
const SUBMIT_COOLDOWN_SECONDS = 5;

type StoredEventDetails = {
  name?: string;
  email?: string;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  pickupDate?: string | null;
  returnDate?: string | null;
};

const emptyEventDetails = (): EventDetailsFormData => ({
  name: '',
  email: '',
  pickupDate: null,
  returnDate: null,
  eventStartDate: null,
  eventEndDate: null,
});

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const reviveDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const loadStoredEventDetails = (): EventDetailsFormData | null => {
  try {
    const raw = sessionStorage.getItem(EVENT_DETAILS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEventDetails;
    return {
      name: parsed.name ?? '',
      email: parsed.email ?? '',
      eventStartDate: reviveDate(parsed.eventStartDate),
      eventEndDate: reviveDate(parsed.eventEndDate),
      pickupDate: reviveDate(parsed.pickupDate),
      returnDate: reviveDate(parsed.returnDate),
    };
  } catch (err) {
    console.error('Failed to load stored event details', err);
    return null;
  }
};

const persistEventDetails = (values: EventDetailsFormData) => {
  try {
    const payload: StoredEventDetails = {
      name: values.name,
      email: values.email,
      eventStartDate: values.eventStartDate?.toISOString() ?? null,
      eventEndDate: values.eventEndDate?.toISOString() ?? null,
      pickupDate: values.pickupDate?.toISOString() ?? null,
      returnDate: values.returnDate?.toISOString() ?? null,
    };
    sessionStorage.setItem(EVENT_DETAILS_SESSION_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to persist event details', err);
  }
};

/** Clears only date fields in session; name/email are kept for the next request. */
const clearStoredEventDates = (profile: Pick<EventDetailsFormData, 'name' | 'email'>) => {
  persistEventDetails({
    name: profile.name,
    email: profile.email,
    eventStartDate: null,
    eventEndDate: null,
    pickupDate: null,
    returnDate: null,
  });
};

type Category = 'All' | 'Tents' | 'Tables' | 'Linens' | 'Displays' | 'Decor' | 'Games' | 'Misc';



export default function HomePage() {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitCooldown, setSubmitCooldown] = useState(0);
  // Idempotency key: generated fresh when the component mounts and reset only
  // after a successful order. If the user retries before success (network hiccup,
  // double-click bypass), the server returns the existing order instead of a dup.
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const { guestEmail, guestName, setGuestEmail, setGuestName, clearStorefrontSession } = useGuestUser();
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const { 
    items: cartItems, 
    addToCart, 
    removeFromCart,
    getTotalQuantity, 
    getItemQuantity, 
    clearCart, 
    updateQuantity,
    wishlistItems, 
    addToWishlist, 
    removeFromWishlist,
    clearWishlist
  } = useCart();
  const [formData, setFormData] = useState<EventDetailsFormData>(() => emptyEventDetails());
  const [activeFilter, setActiveFilter] = useState<Category>('All');
  const [isBannerVisible, setIsBannerVisible] = useState(true);
  const submittingRef = useRef(false);
  // Bumped after cancel/order changes so reservation badges refresh without a date change.
  const [reservationRefreshKey, setReservationRefreshKey] = useState(0);

  // Event-details popup — only opened when the user asks (never blocks browsing or login).
  const [isEventDetailsOpen, setIsEventDetailsOpen] = useState(false);

  // Map of item_id -> date-aware availability for the chosen [pickup, return]
  // window. Empty until the user picks both dates.
  const [dateAvailability, setDateAvailability] = useState<Record<string, DateAwareAvailability>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  // Active checkouts this user already holds for the selected date window (item_id -> reservation).
  const [userReservationsByItemId, setUserReservationsByItemId] = useState<
    Record<string, UserExistingReservation>
  >({});

  // Countdown tick for post-submission cooldown
  useEffect(() => {
    if (submitCooldown <= 0) return;
    const timer = setInterval(() => {
      setSubmitCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [submitCooldown]);

  // Auth/guest logout clears storage; also reset this page's in-memory identity.
  useEffect(() => {
    const onClear = () => {
      setFormData(emptyEventDetails());
      setUserReservationsByItemId({});
      setDateAvailability({});
      setIsEventDetailsOpen(false);
    };
    window.addEventListener(STOREFRONT_CLEAR_EVENT, onClear);
    return () => window.removeEventListener(STOREFRONT_CLEAR_EVENT, onClear);
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from('promo_items')
        .select('*')
        .order('name');

      if (fetchError) throw fetchError;

      setItems(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const bannerDismissed = sessionStorage.getItem('infoBannerDismissed');
    if (bannerDismissed === 'true') {
      setIsBannerVisible(false);
    }
    fetchItems();

    // Rehydrate event details from session, treating stale (past pickup) data
    // as missing so we re-prompt rather than show a useless date.
    const stored = loadStoredEventDetails();
    const today = startOfToday();
    const hasFreshDates =
      !!stored?.pickupDate &&
      !!stored.returnDate &&
      stored.pickupDate >= today;

    const profileName = stored?.name || guestName || '';
    const profileEmail = stored?.email || guestEmail || '';

    if (stored && hasFreshDates) {
      setFormData({
        name: profileName,
        email: profileEmail,
        eventStartDate: stored.eventStartDate,
        eventEndDate: stored.eventEndDate,
        pickupDate: stored.pickupDate,
        returnDate: stored.returnDate,
      });
    } else {
      setFormData(prev => ({
        ...prev,
        name: profileName || prev.name,
        email: profileEmail || prev.email,
        eventStartDate: null,
        eventEndDate: null,
        pickupDate: null,
        returnDate: null,
      }));
    }
  }, []);

  // Auto-fill name/email from local profile cache when context hydrates after mount.
  // Only fill blanks — never re-apply a cleared identity after logout.
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      name: prev.name || guestName || '',
      email: prev.email || guestEmail || '',
    }));
  }, [guestName, guestEmail]);

  // Refresh date-aware availability whenever pickup/return dates or the item
  // list change. When dates are not both selected, clear the map so the UI
  // falls back to the "Pick dates to see availability" hint.
  const pickupDate = formData.pickupDate;
  const returnDate = formData.returnDate;
  useEffect(() => {
    if (!pickupDate || !returnDate || items.length === 0) {
      setDateAvailability({});
      return;
    }

    let cancelled = false;
    setAvailabilityLoading(true);
    fetchAvailabilityForDates(items.map(i => String(i.id)), pickupDate, returnDate)
      .then(rows => {
        if (cancelled) return;
        const next: Record<string, DateAwareAvailability> = {};
        rows.forEach(row => {
          next[row.itemId] = row;
        });
        setDateAvailability(next);

        // Clamp cart lines that exceed newly reported free stock for this window.
        rows.forEach(row => {
          const inCart = getItemQuantity(row.itemId);
          if (inCart > row.availableQuantity) {
            if (row.availableQuantity > 0) {
              updateQuantity(row.itemId, row.availableQuantity);
              const overflow = inCart - row.availableQuantity;
              const catalogItem = items.find(i => String(i.id) === row.itemId);
              if (catalogItem && overflow > 0) {
                addToWishlist(catalogItem, overflow);
              }
              showWarning(
                `${catalogItem?.name || 'An item'} was adjusted for your new dates (${row.availableQuantity} available).`
              );
            } else {
              removeFromCart(row.itemId);
              const catalogItem = items.find(i => String(i.id) === row.itemId);
              if (catalogItem) {
                addToWishlist(catalogItem, inCart);
                showWarning(`${catalogItem.name} is unavailable for these dates and moved to your wishlist.`);
              }
            }
          }
        });
      })
      .catch(err => {
        console.error('Failed to load date-aware availability', err);
        if (!cancelled) setDateAvailability({});
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- clamp helpers are stable enough; avoid re-fetch loops
  }, [pickupDate, returnDate, items, reservationRefreshKey]);

  const userEmail = formData.email.trim();
  useEffect(() => {
    if (!pickupDate || !returnDate || !userEmail) {
      setUserReservationsByItemId({});
      return;
    }

    let cancelled = false;
    fetchUserReservationsForWindow(userEmail, pickupDate, returnDate)
      .then(rows => {
        if (cancelled) return;
        const next: Record<string, UserExistingReservation> = {};
        rows.forEach(row => {
          // If multiple overlapping orders exist for one item, keep the first
          // and accumulate quantity so the badge still blocks correctly.
          const existing = next[row.itemId];
          if (existing) {
            next[row.itemId] = {
              ...existing,
              quantity: existing.quantity + row.quantity,
            };
          } else {
            next[row.itemId] = row;
          }
        });
        setUserReservationsByItemId(next);
      })
      .catch(err => {
        console.error('Failed to load user reservations', err);
        if (!cancelled) setUserReservationsByItemId({});
      });

    return () => {
      cancelled = true;
    };
  }, [pickupDate, returnDate, userEmail, reservationRefreshKey]);

  // Resolves free stock for the selected dates. Returns null while date-aware
  // availability is still loading so the UI does not fall back to the stale
  // static available_quantity column (global snapshot, not date-window stock).
  const getEffectiveAvailable = (item: PromoItem): number | null => {
    const datesArePicked = !!(formData.pickupDate && formData.returnDate);
    if (!datesArePicked) return item.available_quantity;
    const row = dateAvailability[String(item.id)];
    if (!row) return null;
    return row.availableQuantity;
  };

  const datesPicked = !!(formData.pickupDate && formData.returnDate);

  const handleClearStorefrontIdentity = () => {
    clearStorefrontSession();
    setFormData(emptyEventDetails());
    setUserReservationsByItemId({});
    setDateAvailability({});
  };

  const handleRequesterEmailChange = (email: string) => {
    const trimmed = email.trim();
    if (!isVellumEmail(trimmed)) {
      showError('Please use your @vellummortgage.com email address');
      return false;
    }
    const previous = formData.email.trim().toLowerCase();
    const next = trimmed.toLowerCase();
    setGuestEmail(trimmed);
    setFormData(prev => {
      const updated = { ...prev, email: trimmed };
      persistEventDetails(updated);
      return updated;
    });
    // Switching requester identity must not keep the previous LO's draft cart.
    if (previous && previous !== next) {
      clearCart();
      clearWishlist();
      setUserReservationsByItemId({});
      setReservationRefreshKey(k => k + 1);
    }
    return true;
  };

  const handleOrdersChanged = () => {
    setReservationRefreshKey(k => k + 1);
  };

  const handleSubmit = async () => {
    // Guard: ignore if already submitting or in cooldown period
    if (submittingRef.current || submitCooldown > 0) return;

    if (!formData.name || !formData.email || !formData.pickupDate || !formData.returnDate || !formData.eventStartDate || !formData.eventEndDate) {
      showError('Please fill in all required fields');
      return;
    }
    
    if (!isVellumEmail(formData.email)) {
      showError('Please use your @vellummortgage.com email address');
      return;
    }

    if (cartItems.length === 0 && wishlistItems.length === 0) {
      showError('Please add items to your cart or wishlist before submitting');
      return;
    }

    // Lock submission immediately — before any async work — so concurrent
    // calls (e.g., double-click bypass) are dropped at the top of this guard.
    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    // Helper: apply structured stock conflicts to the cart and surface a
    // specific, per-item message (issue #17). Used both for the pre-submit
    // validation pass AND for the post-submit race-condition recovery (#14).
    const applyConflictsAndNotify = (
      conflicts: Array<{ item_id: string; item_name?: string; requested: number; available: number }>
    ) => {
      conflicts.forEach(conflict => {
        const cartItem = cartItems.find(c => String(c.id) === String(conflict.item_id));
        if (!cartItem) return;

        removeFromCart(String(cartItem.id));
        if (conflict.available > 0) {
          addToCart(cartItem as PromoItem, conflict.available);
          const remainder = conflict.requested - conflict.available;
          if (remainder > 0) {
            addToWishlist(cartItem as PromoItem, remainder);
          }
        } else {
          addToWishlist(cartItem as PromoItem, conflict.requested);
        }
      });

      const lines = conflicts.map(c => {
        const name = c.item_name
          ?? cartItems.find(ci => String(ci.id) === String(c.item_id))?.name
          ?? 'Item';
        return c.available > 0
          ? `${name}: requested ${c.requested}, only ${c.available} available`
          : `${name}: requested ${c.requested}, none available — moved to wishlist`;
      });

      const headline = conflicts.length === 1
        ? 'Cart adjusted for 1 item'
        : `Cart adjusted for ${conflicts.length} items`;
      showWarning(`${headline}:\n${lines.join('\n')}`);
      showInfo('Please review your updated cart and submit again.');
    };

    try {
      // Pre-submit: validate cart availability against the chosen dates so we
      // can show a helpful message before doing the heavier order RPC.
      if (cartItems.length > 0) {
        const validation = await validateCartAvailability(
          cartItems,
          formData.pickupDate,
          formData.returnDate
        );

        if (!validation.isValid) {
          const conflicts = [
            ...validation.unavailableItems.map(item => ({
              item_id: String(item.id),
              item_name: item.name,
              requested: item.requestedQuantity,
              available: 0,
            })),
            ...validation.staleItems.map(s => ({
              item_id: String(s.item.id),
              item_name: s.item.name,
              requested: s.requestedQuantity,
              available: s.currentAvailable,
            })),
          ];

          applyConflictsAndNotify(conflicts);
          setIsSubmitting(false);
          submittingRef.current = false;
          return;
        }
      }

      const orderFormData: OrderFormData = formData;
      let orderId: string | null = null;
      let orderNumber: string | null = null;
      let orderSuccessful = false;
      let wishlistSaved = false;
      let wishlistToSubmit = wishlistItems;

      if (
        wishlistItems.length > 0 &&
        formData.pickupDate &&
        formData.returnDate &&
        formData.email.trim()
      ) {
        const { allowed, blocked } = await filterWishlistBlockedByOwnReservation(
          wishlistItems,
          formData.email,
          formData.pickupDate,
          formData.returnDate,
        );
        wishlistToSubmit = allowed;
        blocked.forEach(({ item, reservation }) => {
          removeFromWishlist(String(item.id));
          showWarning(formatReservationMessage(reservation, item.name));
        });
        if (blocked.length > 0 && allowed.length === 0 && cartItems.length === 0) {
          showError('These items are already on one of your active orders. Check order history.');
          setIsSubmitting(false);
          submittingRef.current = false;
          return;
        }
      }

      let orderReplayed = false;

      if (cartItems.length > 0) {
        try {
          const orderResult = await createOrderAtomic(orderFormData, cartItems, 'pending', idempotencyKey);
          orderId = orderResult.orderId;
          orderNumber = orderResult.orderNumber;
          orderReplayed = orderResult.replayed;
          orderSuccessful = true;
        } catch (rpcErr) {
          // Race condition (#14): another order grabbed inventory between our
          // pre-validation and the server-side transaction. The RPC returns a
          // structured per-item conflict list which we re-apply to the cart.
          if (rpcErr instanceof InsufficientStockError) {
            applyConflictsAndNotify(rpcErr.conflicts);
            setIsSubmitting(false);
            submittingRef.current = false;
            return;
          }
          throw rpcErr;
        }
      } else if (wishlistToSubmit.length > 0) {
        const orderResult = await createOrderAtomic(orderFormData, [], 'wishlist_only', idempotencyKey);
        orderId = orderResult.orderId;
        orderNumber = orderResult.orderNumber;
        orderReplayed = orderResult.replayed;
      }

      if (wishlistToSubmit.length > 0 && orderId && !orderReplayed) {
        await saveWishlistItems(orderId, wishlistToSubmit, orderFormData);
        wishlistSaved = true;
      }

      // Skip side effects on idempotent replay so retries don't re-email / re-webhook.
      if ((orderSuccessful || wishlistSaved) && orderId && !orderReplayed) {
        await sendOrderNotifications(orderId, orderNumber, orderFormData, cartItems, wishlistToSubmit);
        
        if (orderSuccessful) {
          await sendPowerAutomateWebhook(orderId, orderNumber, orderFormData);
        }
      }

      const profileName = formData.name.trim();
      const profileEmail = formData.email.trim();
      if (profileName) setGuestName(profileName);
      if (profileEmail) setGuestEmail(profileEmail);

      const profileOnly: EventDetailsFormData = {
        name: profileName,
        email: profileEmail,
        pickupDate: null,
        returnDate: null,
        eventStartDate: null,
        eventEndDate: null,
      };
      setFormData(profileOnly);
      clearStoredEventDates(profileOnly);
      setIsEventDetailsOpen(false);
      clearCart();
      clearWishlist();
      setReservationRefreshKey(k => k + 1);
      await fetchItems();

      // Rotate idempotency key only after a confirmed successful submission.
      // Any retry before this point reuses the same key, so the server will
      // return the existing order rather than creating a duplicate.
      setIdempotencyKey(crypto.randomUUID());

      if (orderSuccessful && wishlistSaved) {
        showSuccess('Order submitted and wishlist request saved! Check your email for confirmation.');
      } else if (orderSuccessful) {
        showSuccess('Order submitted successfully! Check your email for confirmation and calendar invites.');
      } else if (wishlistSaved) {
        showSuccess('Wishlist request submitted! We\'ll notify you when items become available.');
      }

    } catch (err: any) {
      console.error('Order submission error:', err);
      showError(err.message || 'Failed to process request. Please try again.');
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
      // Start cooldown after every attempt (success or failure).
      // The UI shows a countdown so users know when they can resubmit.
      setSubmitCooldown(SUBMIT_COOLDOWN_SECONDS);
    }
  };

  const handleEventDetailsSubmit = (values: EventDetailsFormData) => {
    const previousEmail = formData.email.trim().toLowerCase();
    const nextEmail = values.email.trim().toLowerCase();
    setFormData(values);
    persistEventDetails(values);
    const trimmedName = values.name.trim();
    const trimmedEmail = values.email.trim();
    if (trimmedName) setGuestName(trimmedName);
    if (trimmedEmail) setGuestEmail(trimmedEmail);
    if (previousEmail && nextEmail && previousEmail !== nextEmail) {
      clearCart();
      clearWishlist();
      setUserReservationsByItemId({});
    }
    setReservationRefreshKey(k => k + 1);
    setIsEventDetailsOpen(false);
  };

  const openEventDetailsModal = () => {
    setIsEventDetailsOpen(true);
  };

  const handleFilterChange = (filter: Category) => {
    setActiveFilter(filter);
  };
  
  // Memoize filtered items to avoid recalculating on every render
  const filteredItems = useMemo(() => {
    if (activeFilter === 'All') {
      return items;
    }
    return items.filter(item => item.category === activeFilter);
  }, [items, activeFilter]);

  const handleDismissBanner = () => {
    setIsBannerVisible(false);
    sessionStorage.setItem('infoBannerDismissed', 'true');
  };

  // Handle reordering items from order history
  const handleReorderItems = async (reorderItems: Array<{ id: string; quantity: number }>) => {
    try {
      const { data: currentItems, error: itemsError } = await supabase
        .from('promo_items')
        .select('*')
        .in('id', reorderItems.map(item => item.id));

      if (itemsError) throw itemsError;

      let addedToCart = 0;
      let addedToWishlist = 0;
      let blockedByOwn = 0;

      for (const reorderItem of reorderItems) {
        const itemData = currentItems?.find(item => item.id === reorderItem.id);
        if (!itemData) continue;

        const ownReservation = userReservationsByItemId[String(itemData.id)];
        if (ownReservation) {
          blockedByOwn++;
          showInfo(formatReservationMessage(ownReservation, itemData.name));
          continue;
        }

        const availableQuantity = getEffectiveAvailable(itemData);
        const requestedQuantity = reorderItem.quantity;

        if (availableQuantity === null) {
          showWarning('Pick event dates before reordering so we can check availability.');
          return;
        }

        if (availableQuantity > 0) {
          const quantityToAdd = Math.min(requestedQuantity, availableQuantity);
          addToCart(itemData, quantityToAdd);
          addedToCart++;

          if (requestedQuantity > availableQuantity) {
            addToWishlist(itemData, requestedQuantity - availableQuantity);
            addedToWishlist++;
          }
        } else {
          addToWishlist(itemData, requestedQuantity);
          addedToWishlist++;
        }
      }

      if (addedToCart > 0 && addedToWishlist > 0) {
        showInfo(`${addedToCart} item(s) added to cart, ${addedToWishlist} to wishlist (limited availability).`);
      } else if (addedToCart > 0) {
        showSuccess('Items added to your cart! Review and submit when ready.');
      } else if (addedToWishlist > 0) {
        showWarning('Items are currently unavailable and have been added to your wishlist.');
      } else if (blockedByOwn > 0) {
        showInfo('Those items are already on one of your active orders.');
      }
    } catch (err) {
      showError('Failed to add items. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <SimpleNavbar />
      
      <div className="pt-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="sticky top-16 z-20 bg-gray-50 py-4">
            <ItemFilterBar 
              activeFilter={activeFilter} 
              onFilterChange={handleFilterChange} 
            />
          </div>
        
          {isBannerVisible && (
            <div className="relative bg-gradient-to-r from-[rgb(0,54,86)] to-[rgb(0,117,174)] text-white rounded-xl p-4 mb-6">
              <button 
                onClick={handleDismissBanner}
                className="absolute top-2 right-2 text-white opacity-70 hover:opacity-100 p-1 rounded-full hover:bg-white/20"
                aria-label="Dismiss info banner"
              >
                <X className="h-5 w-5" />
              </button>
              <h1 className="text-2xl font-bold mb-2">Vellum Mortgage Event Items Store</h1>
              <p className="text-base opacity-90 mb-3">
                {datesPicked
                  ? `Showing availability for ${format(formData.pickupDate!, 'MMM d')} – ${format(formData.returnDate!, 'MMM d, yyyy')}${availabilityLoading ? ' (checking reservations…)' : ''}.`
                  : 'Browse the catalog anytime. Add your event dates when you are ready to see availability and request items.'}
              </p>
              <div className="bg-white bg-opacity-10 p-3 rounded-lg text-sm">
                <h3 className="font-semibold mb-1">How to Use:</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Browse items in the store.</li>
                  <li>Add event dates to see what is available for your pickup and return window.</li>
                  <li>Add items to your request and submit from the bottom bar.</li>
                </ol>
              </div>
            </div>
          )}

          {!datesPicked && (
            <button
              type="button"
              onClick={openEventDetailsModal}
              className="mb-6 w-full rounded-xl border-2 border-dashed border-[#0075AE] bg-blue-50 px-4 py-4 text-left transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-[#0075AE] focus:ring-offset-2"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-[#0075AE] shadow-sm">
                  <CalendarRange className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-[#0075AE]">Add event dates to see availability</p>
                  <p className="text-sm text-gray-600">
                    Tell us when your event is and when you will pick up and return items. You can browse without this step.
                  </p>
                </div>
              </div>
            </button>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const cartQuantity = getItemQuantity(String(item.id));
                const effectiveAvailable = getEffectiveAvailable(item);
                const availabilityKnown = !datesPicked || effectiveAvailable !== null;
                const isOutOfStock = datesPicked && effectiveAvailable !== null && effectiveAvailable <= 0;
                const hasConflicts =
                  datesPicked &&
                  effectiveAvailable !== null &&
                  effectiveAvailable < item.total_quantity;
                const ownReservation = userReservationsByItemId[String(item.id)];
                // Block add when this LO already holds the item and nothing else is free
                // for the window — prevents a second "order" for the same tent/etc.
                const blockedByOwnOrder = !!ownReservation && isOutOfStock;
                const freeForDates = effectiveAvailable ?? 0;
                return (
                  <div key={item.id} className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col">
                    <div className="aspect-square relative">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                          <Package2 className="h-1/3 w-1/3 text-gray-400" />
                        </div>
                      )}
                      {cartQuantity > 0 && (
                        <div className="absolute top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                          {cartQuantity} in cart
                        </div>
                      )}
                    </div>

                    <div className="p-6 flex flex-col flex-grow">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xl font-semibold text-[#58595B] flex-1 mr-2">{item.name}</h3>
                        <ItemCalendar itemId={item.id} itemName={item.name} />
                      </div>
                      <p className="text-[#58595B] opacity-80 mb-4 text-sm flex-grow">{item.description}</p>
                      
                      <div className="flex items-center justify-between mb-4 mt-auto pt-4 border-t border-gray-100">
                        <div className="text-sm text-[#58595B] opacity-80">
                          {datesPicked ? (
                            <>
                              <p>
                                Available for your dates:{' '}
                                <span className={`font-semibold ${isOutOfStock ? 'text-red-600' : 'text-gray-900'}`}>
                                  {!availabilityKnown || (availabilityLoading && effectiveAvailable === null)
                                    ? '…'
                                    : freeForDates}
                                </span>
                                {' '}of {item.total_quantity}
                              </p>
                              {ownReservation && (
                                <p className="mt-1 text-xs font-medium text-[#0075AE]">
                                  On your order {ownReservation.orderNumber || '—'}
                                  {ownReservation.quantity > 1 ? ` (${ownReservation.quantity})` : ''}
                                </p>
                              )}
                              {hasConflicts && !ownReservation && effectiveAvailable !== null && (
                                <div className="mt-1">
                                  <AvailabilityInfo
                                    itemId={String(item.id)}
                                    startDate={formData.pickupDate!}
                                    endDate={formData.returnDate!}
                                    label={
                                      effectiveAvailable === 0
                                        ? 'Why unavailable?'
                                        : `Only ${effectiveAvailable} free — why?`
                                    }
                                  />
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <p>Total in inventory: {item.total_quantity}</p>
                              <button
                                type="button"
                                onClick={openEventDetailsModal}
                                className="mt-1 text-xs font-medium text-[#0075AE] hover:underline text-left"
                              >
                                Add event dates to see availability
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          defaultValue="1"
                          className="w-20 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          id={`quantity-${item.id}`}
                        />
                        <button
                          className={`flex-1 px-4 py-2 rounded-lg transition-colors text-white ${
                            !datesPicked
                              ? 'bg-gray-500 hover:bg-gray-600'
                              : !availabilityKnown
                                ? 'bg-gray-400 cursor-wait'
                                : blockedByOwnOrder
                                  ? 'bg-gray-400 cursor-not-allowed'
                                  : isOutOfStock
                                    ? 'bg-orange-500 hover:bg-orange-600'
                                    : 'bg-[#0075AE] hover:bg-[#005f8c] disabled:opacity-50 disabled:cursor-not-allowed'
                           }`}
                          disabled={
                            blockedByOwnOrder ||
                            !availabilityKnown ||
                            (datesPicked && !isOutOfStock && cartQuantity >= freeForDates)
                          }
                          onClick={() => {
                            if (!datesPicked) {
                              openEventDetailsModal();
                              return;
                            }

                            if (!availabilityKnown || effectiveAvailable === null) {
                              showInfo('Checking availability for your dates…');
                              return;
                            }

                            const input = document.getElementById(`quantity-${item.id}`) as HTMLInputElement;
                            const quantity = parseInt(input.value) || 1;

                            if (quantity <= 0) {
                              showError('Please enter a valid quantity');
                              return;
                            }

                            if (blockedByOwnOrder && ownReservation) {
                              showInfo(formatReservationMessage(ownReservation, item.name));
                              return;
                            }

                            if (isOutOfStock) {
                              addToWishlist(item, quantity);
                              showInfo(`${item.name} added to wishlist`);
                            } else {
                              const currentInCart = getItemQuantity(String(item.id));
                              const totalRequested = currentInCart + quantity;

                              if (totalRequested <= effectiveAvailable) {
                                addToCart(item, quantity);
                                showSuccess(`${item.name} added to cart`);
                              } else {
                                const maxAddable = effectiveAvailable - currentInCart;
                                if (maxAddable > 0) {
                                  showWarning(`Only ${maxAddable} more available for your dates. Adjusted quantity.`);
                                  addToCart(item, maxAddable);
                                } else {
                                  showWarning(`Maximum quantity already in cart`);
                                }
                              }
                            }
                            input.value = "1";
                          }}
                        >
                          {!datesPicked
                            ? 'Request'
                            : !availabilityKnown
                              ? 'Checking…'
                              : blockedByOwnOrder
                                ? 'On Your Order'
                                : isOutOfStock
                                  ? 'Add to Wishlist'
                                  : (cartQuantity >= freeForDates ? 'Max in Cart' : 'Add to Cart')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-1 md:col-span-3 lg:col-span-4 text-center py-12">
                <p className="text-gray-500">No items found for the selected category '{activeFilter}'.</p>
              </div>
            )}
          </div>

          {error && (
            <div className="fixed bottom-24 right-5 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50" role="alert">
              <strong className="font-bold">Error!</strong>
              <span className="block sm:inline"> {error}</span>
              <button 
                className="absolute top-0 bottom-0 right-0 px-4 py-3" 
                onClick={() => setError(null)}
                aria-label="Close error"
              >
                <X className="h-6 w-6 text-red-500" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Request Bar */}
      <BottomRequestBar
        formData={formData}
        onEditDetails={openEventDetailsModal}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitCooldown={submitCooldown}
        cartItems={cartItems}
        removeFromCart={removeFromCart}
        clearCart={clearCart}
        getTotalQuantity={getTotalQuantity}
        wishlistItems={wishlistItems}
        removeFromWishlist={removeFromWishlist}
        onReorderItems={handleReorderItems}
        dateAvailability={dateAvailability}
        onClearIdentity={handleClearStorefrontIdentity}
        onRequesterEmailChange={handleRequesterEmailChange}
        onOrdersChanged={handleOrdersChanged}
      />

      {isEventDetailsOpen && (
        <EventDetailsModal
          mode="edit"
          hasDatesSet={datesPicked}
          initialValues={formData}
          onSubmit={handleEventDetailsSubmit}
          onCancel={() => setIsEventDetailsOpen(false)}
        />
      )}
    </div>
  );
}