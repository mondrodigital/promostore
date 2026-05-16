import { useEffect, useState, useMemo, useRef } from 'react';
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
import {
  validateCartAvailability,
  createOrderAtomic,
  saveWishlistItems,
  sendOrderNotifications,
  sendPowerAutomateWebhook,
  fetchAvailabilityForDates,
  InsufficientStockError,
  type OrderFormData,
  type DateAwareAvailability,
} from '../services/orderService';

// Seconds to disable the submit button after any submission attempt (success or failure).
// Prevents accidental double-clicks and rapid-fire retries from the UI.
const SUBMIT_COOLDOWN_SECONDS = 5;

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
  const { guestEmail, setGuestEmail } = useGuestUser();
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  const { 
    items: cartItems, 
    addToCart, 
    removeFromCart,
    getTotalQuantity, 
    getItemQuantity, 
    clearCart, 
    wishlistItems, 
    addToWishlist, 
    removeFromWishlist,
    clearWishlist
  } = useCart();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    pickupDate: null as Date | null,
    returnDate: null as Date | null,
    eventStartDate: null as Date | null,
    eventEndDate: null as Date | null
  });
  const [activeFilter, setActiveFilter] = useState<Category>('All');
  const [isBannerVisible, setIsBannerVisible] = useState(true);
  const submittingRef = useRef(false);

  // Map of item_id -> date-aware availability for the chosen [pickup, return]
  // window. Empty until the user picks both dates.
  const [dateAvailability, setDateAvailability] = useState<Record<string, DateAwareAvailability>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Countdown tick for post-submission cooldown
  useEffect(() => {
    if (submitCooldown <= 0) return;
    const timer = setInterval(() => {
      setSubmitCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [submitCooldown]);

  const validateEmail = (email: string) => {
    return email.toLowerCase().endsWith('@vellummortgage.com');
  };

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
  }, []);

  // Auto-fill email from cached guest email
  useEffect(() => {
    if (guestEmail && !formData.email) {
      setFormData(prev => ({
        ...prev,
        email: guestEmail,
      }));
    }
  }, [guestEmail]);

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
  }, [pickupDate, returnDate, items]);

  // Resolves the effective available quantity for an item, preferring the
  // date-aware value when dates have been picked.
  const getEffectiveAvailable = (item: PromoItem): number => {
    const datesPicked = !!(formData.pickupDate && formData.returnDate);
    if (!datesPicked) return item.available_quantity;
    const row = dateAvailability[String(item.id)];
    return row ? row.availableQuantity : item.available_quantity;
  };

  const datesPicked = !!(formData.pickupDate && formData.returnDate);

  const handleSubmit = async () => {
    // Guard: ignore if already submitting or in cooldown period
    if (submittingRef.current || submitCooldown > 0) return;

    if (!formData.name || !formData.email || !formData.pickupDate || !formData.returnDate || !formData.eventStartDate || !formData.eventEndDate) {
      showError('Please fill in all required fields');
      return;
    }
    
    if (!validateEmail(formData.email)) {
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

      if (cartItems.length > 0) {
        try {
          const orderResult = await createOrderAtomic(orderFormData, cartItems, 'pending', idempotencyKey);
          orderId = orderResult.orderId;
          orderNumber = orderResult.orderNumber;
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
      } else if (wishlistItems.length > 0) {
        const orderResult = await createOrderAtomic(orderFormData, [], 'wishlist_only', idempotencyKey);
        orderId = orderResult.orderId;
        orderNumber = orderResult.orderNumber;
      }

      if (wishlistItems.length > 0 && orderId) {
        await saveWishlistItems(orderId, wishlistItems, orderFormData);
        wishlistSaved = true;
      }

      if ((orderSuccessful || wishlistSaved) && orderId) {
        await sendOrderNotifications(orderId, orderNumber, orderFormData, cartItems, wishlistItems);
        
        if (orderSuccessful) {
          await sendPowerAutomateWebhook(orderId, orderNumber, orderFormData);
        }
      }

      if (guestEmail !== formData.email) {
        setGuestEmail(formData.email);
      }

      setFormData({ name: '', email: '', pickupDate: null, returnDate: null, eventStartDate: null, eventEndDate: null });
      clearCart();
      clearWishlist();
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

  // Generic handler for simple inputs (Name, Email)
  const handleFormDataChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handlers for range selection
  const handleEventDateChange = (dates: [Date | null, Date | null]) => {
    const [start, end] = dates;
    setFormData(prev => ({ ...prev, eventStartDate: start, eventEndDate: end }));
  };

  const handlePickupReturnDateChange = (dates: [Date | null, Date | null]) => {
    const [start, end] = dates;
    setFormData(prev => ({ ...prev, pickupDate: start, returnDate: end }));
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

      reorderItems.forEach(reorderItem => {
        const itemData = currentItems?.find(item => item.id === reorderItem.id);
        if (itemData) {
          const availableQuantity = getEffectiveAvailable(itemData);
          const requestedQuantity = reorderItem.quantity;
          
          if (availableQuantity > 0) {
            const quantityToAdd = Math.min(requestedQuantity, availableQuantity);
            addToCart(itemData, quantityToAdd);
            addedToCart++;
            
            // Add remainder to wishlist if needed
            if (requestedQuantity > availableQuantity) {
              addToWishlist(itemData, requestedQuantity - availableQuantity);
              addedToWishlist++;
            }
          } else {
            addToWishlist(itemData, requestedQuantity);
            addedToWishlist++;
          }
        }
      });

      if (addedToCart > 0 && addedToWishlist > 0) {
        showInfo(`${addedToCart} item(s) added to cart, ${addedToWishlist} to wishlist (limited availability).`);
      } else if (addedToCart > 0) {
        showSuccess('Items added to your cart! Review and submit when ready.');
      } else if (addedToWishlist > 0) {
        showWarning('Items are currently unavailable and have been added to your wishlist.');
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
                Welcome! Use this tool to check out promotional items for your events. All items are free to use.
              </p>
              <div className="bg-white bg-opacity-10 p-3 rounded-lg text-sm">
                <h3 className="font-semibold mb-1">How to Use:</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Browse available items below. Check availability and details.</li>
                  <li>Enter the desired quantity and click "Add to Cart" for each item needed.</li>
                  <li>Click the cart icon to open the order form and fill out your details.</li>
                  <li>Click "Place Order". You'll receive an email confirmation shortly.</li>
                </ol>
              </div>
            </div>
          )}

          {!datesPicked && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <CalendarRange className="h-5 w-5 flex-shrink-0 text-blue-600" />
              <div>
                <p className="font-medium">Pick your pickup and return dates to see real availability.</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Until you do, each card shows the total stock — items may already be reserved for other dates.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const cartQuantity = getItemQuantity(String(item.id));
                const effectiveAvailable = getEffectiveAvailable(item);
                const isOutOfStock = datesPicked ? effectiveAvailable <= 0 : item.available_quantity <= 0;
                const hasConflicts = datesPicked && effectiveAvailable < item.total_quantity;
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
                                <span className={`font-semibold ${effectiveAvailable === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                  {availabilityLoading && dateAvailability[String(item.id)] === undefined
                                    ? '…'
                                    : effectiveAvailable}
                                </span>
                                {' '}of {item.total_quantity}
                              </p>
                              {hasConflicts && (
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
                              <p>Total: {item.total_quantity}</p>
                              <p className="text-xs text-gray-500 italic">Pick dates to see availability</p>
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
                            isOutOfStock
                              ? 'bg-orange-500 hover:bg-orange-600'
                              : 'bg-[#0075AE] hover:bg-[#005f8c] disabled:opacity-50 disabled:cursor-not-allowed'
                           }`}
                          disabled={!isOutOfStock && cartQuantity >= effectiveAvailable}
                          onClick={() => {
                            const input = document.getElementById(`quantity-${item.id}`) as HTMLInputElement;
                            const quantity = parseInt(input.value) || 1;

                            if (quantity <= 0) {
                              showError('Please enter a valid quantity');
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
                          {isOutOfStock ? 'Add to Wishlist' : (cartQuantity >= effectiveAvailable ? 'Max in Cart' : 'Add to Cart')}
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
        onFormDataChange={handleFormDataChange}
        onEventDateChange={handleEventDateChange}
        onPickupReturnDateChange={handlePickupReturnDateChange}
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
      />
    </div>
  );
}