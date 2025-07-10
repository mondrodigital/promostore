import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Package2, ShoppingCart, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import type { PromoItem } from '../types';
import "react-datepicker/dist/react-datepicker.css";
import ItemCalendar from '../components/ItemCalendar';
import Navbar from '../components/Navbar';
import TopBookingBar from '../components/TopBookingBar';
import ItemFilterBar from '../components/ItemFilterBar';
import { format } from 'date-fns';

// Define Category type (can be moved to types.ts later)
type Category = 'All' | 'Tents' | 'Tables' | 'Linens' | 'Displays' | 'Decor' | 'Games' | 'Misc';

// Helper function to determine category from item name (simple version)
const getItemCategory = (itemName: string): Category => {
  const lowerName = itemName.toLowerCase();
  if (lowerName.includes('tent')) return 'Tents';
  if (lowerName.includes('table') && !lowerName.includes('cover') && !lowerName.includes('cloth') && !lowerName.includes('runner')) return 'Tables';
  if (lowerName.includes('cover') || lowerName.includes('cloth') || lowerName.includes('runner')) return 'Linens';
  if (lowerName.includes('banner') || lowerName.includes('easel') || lowerName.includes('frame') || lowerName.includes('riser') || lowerName.includes('stand')) return 'Displays';
  if (lowerName.includes('house') || lowerName.includes('jar')) return 'Decor';
  if (lowerName.includes('cornhole')) return 'Games';
  if (lowerName.includes('tub')) return 'Misc'; 
  // Fallback or decide if unclassified items should show in 'All' only or a specific category
  // For now, let them appear only in 'All' by not matching explicitly
  return 'Misc'; // Default fallback, adjust as needed
};

export default function HomePage() {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
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

  const validateEmail = (email: string) => {
    return email.toLowerCase().endsWith('@vellummortgage.com');
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('promo_items')
        .select('*')
        .order('name');

      if (error) throw error;

      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching items:', err);
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

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
        setIsSearchExpanded(false);
      }
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const toggleSearchExpand = () => {
    setIsSearchExpanded(prev => !prev);
  };

  const handleSubmit = async () => {
    
    // Ensure required form data is present (dates, name, email)
    if (!formData.name || !formData.email || !formData.pickupDate || !formData.returnDate || !formData.eventStartDate || !formData.eventEndDate) {
      setError('Please fill in all required fields in the top bar');
      return;
    }
     if (!validateEmail(formData.email)) {
      setError('Please use your @vellummortgage.com email address');
      return;
    }

    // Check if there's anything to submit (cart or wishlist)
    if (cartItems.length === 0 && wishlistItems.length === 0) {
      setError('Please add items to your cart or wishlist before submitting');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    let orderSuccessful = false;
    let orderId: string | null = null;
    let wishlistSaved = false;

    try {
      // --- 1. Handle Cart Items (Actual Order) ---
      if (cartItems.length > 0) {
        const orderItemsPayload = cartItems.map(item => ({
          item_id: item.id,
          quantity: item.requestedQuantity
        }));

        const { data, error: submitError } = await supabase.rpc(
          'create_order_with_checkouts',
          {
            p_checkout_date: formData.pickupDate.toISOString().split('T')[0],
            p_items: orderItemsPayload,
            p_return_date: formData.returnDate.toISOString().split('T')[0],
            p_user_email: formData.email,
            p_user_name: formData.name
          }
        );

        if (submitError) throw new Error(`Order submission failed: ${submitError.message}`);
        
        orderSuccessful = true; // Assume success if no error thrown
        orderId = data?.order_id || null; // Capture order ID if available
      }

      // --- 2. Handle Wishlist Items (Save Request) ---
      if (wishlistItems.length > 0) {
         const wishlistRequestsPayload = wishlistItems.map(item => ({
            order_id: orderId,
            user_name: formData.name,
            user_email: formData.email,
            item_id: item.id,
            requested_quantity: item.requestedQuantity,
            requested_pickup_date: formData.pickupDate!.toISOString().split('T')[0],
            requested_return_date: formData.returnDate!.toISOString().split('T')[0],
            event_start_date: formData.eventStartDate!.toISOString().split('T')[0],
            event_end_date: formData.eventEndDate!.toISOString().split('T')[0],
            status: 'pending' // Initial status
         }));

         console.log("Saving wishlist requests:", wishlistRequestsPayload);
         
         const { error: wishlistError } = await supabase.rpc(
           'add_wishlist_requests', 
           { requests: wishlistRequestsPayload }
         );
         if (wishlistError) {
            console.error("Error saving wishlist requests:", wishlistError);
            // Decide if this should prevent proceeding (e.g., show error and stop)
            throw new Error(`Failed to save wishlist request: ${wishlistError.message}`);
         }
         wishlistSaved = true; // Set only if RPC call succeeds
      }
      
      // --- 3. Send Combined Notifications (if cart order OR wishlist saved) ---
       if (orderSuccessful || wishlistSaved) {
            try {
                const notificationPayload = {
                    orderId: orderId, // Will be null if only wishlist
                    customerName: formData.name,
                    customerEmail: formData.email,
                    pickupDate: formData.pickupDate?.toLocaleDateString(),
                    returnDate: formData.returnDate?.toLocaleDateString(),
                    eventStartDate: formData.eventStartDate?.toLocaleDateString(),
                    eventEndDate: formData.eventEndDate?.toLocaleDateString(),
                    // Include BOTH lists in the payload
                    checkedOutItems: cartItems.map(item => ({ name: item.name, quantity: item.requestedQuantity })),
                    wishlistItems: wishlistItems.map(item => ({ name: item.name, quantity: item.requestedQuantity }))
                };

                console.log("Sending combined notification payload:", notificationPayload);

                 // Call existing functions - they need to be updated to handle the lists
                 // TODO: Ensure these functions are updated on the backend
                 await supabase.functions.invoke('send-order-notification', { body: notificationPayload });
                 await supabase.functions.invoke('send-user-confirmation', { body: notificationPayload });

                 // Send calendar invites for pickup and return dates
                 if (formData.pickupDate && formData.returnDate) {
                     try {
                         // Create pickup reminder
                         const pickupStartTime = new Date(formData.pickupDate);
                         pickupStartTime.setHours(9, 0, 0, 0); // Default to 9 AM
                         const pickupEndTime = new Date(pickupStartTime);
                         pickupEndTime.setHours(10, 0, 0, 0); // 1 hour duration

                         const pickupInvite = {
                             orderId: orderId,
                             customerName: formData.name,
                             customerEmail: formData.email,
                             eventType: 'pickup',
                             startTime: pickupStartTime.toISOString(),
                             endTime: pickupEndTime.toISOString(),
                             location: 'Vellum Marketing Office',
                             additionalAttendees: ['marketing@vellummortgage.com']
                         };

                         // Create return reminder  
                         const returnStartTime = new Date(formData.returnDate);
                         returnStartTime.setHours(9, 0, 0, 0); // Default to 9 AM
                         const returnEndTime = new Date(returnStartTime);
                         returnEndTime.setHours(10, 0, 0, 0); // 1 hour duration

                         const returnInvite = {
                             orderId: orderId,
                             customerName: formData.name,
                             customerEmail: formData.email,
                             eventType: 'return',
                             startTime: returnStartTime.toISOString(),
                             endTime: returnEndTime.toISOString(),
                             location: 'Vellum Marketing Office',
                             additionalAttendees: ['marketing@vellummortgage.com']
                         };

                         // Send calendar invites
                         await supabase.functions.invoke('send-calendar-invite', { body: pickupInvite });
                         await supabase.functions.invoke('send-calendar-invite', { body: returnInvite });

                         console.log('Calendar invites sent for pickup and return dates');
                     } catch (calendarError) {
                         console.error('Failed to send calendar invites:', calendarError);
                         // Don't block the main flow if calendar fails
                     }
                 }

            } catch (invokeError) {
                console.error('Failed to invoke combined notification functions:', invokeError);
                // Decide if this should block success message? Probably not.
            }
       }


      // --- 4. Cleanup and Success ---
      setFormData({ name: '', email: '', pickupDate: null, returnDate: null, eventStartDate: null, eventEndDate: null });
      clearCart();
      clearWishlist(); 
      
      await fetchItems(); // Refresh item availability
      
      // Construct success message
      let successMessage = "";
      if (orderSuccessful && wishlistSaved) {
          successMessage = "Order submitted and wishlist request saved! Check your email for confirmation and calendar invites.";
      } else if (orderSuccessful) {
          successMessage = "Order submitted successfully! Check your email for confirmation and calendar invites for pickup/return.";
      } else if (wishlistSaved) {
          successMessage = "Your wishlist request has been submitted! See email for details.";
      } else {
          // This case shouldn't be reached if initial check passes, but as fallback:
          successMessage = "Request processed."; 
      }
      alert(successMessage); 

    } catch (err: any) {
      console.error('Error during submission process:', err); // Log the actual error
      setError(err.message || 'Failed to process request');
    } finally {
      setIsSubmitting(false);
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
    return items.filter(item => getItemCategory(item.name) === activeFilter);
  }, [items, activeFilter]);

  const handleDismissBanner = () => {
    setIsBannerVisible(false);
    sessionStorage.setItem('infoBannerDismissed', 'true');
  };

  // Calculate sticky top offset for filter bar
  const navHeight = '5rem'; // From Navbar h-20
  const bookingBarApproxHeight = '76px'; // From TopBookingBar calculation used elsewhere
  const showFullBookingBar = !isScrolled || isSearchExpanded;
  const stickyTopOffset = showFullBookingBar ? `calc(${navHeight} + ${bookingBarApproxHeight})` : navHeight;

  // Define wrapper function for prop drilling consistency
  const handleRemoveFromCart = (itemId: string) => {
      removeFromCart(itemId);
  };
  
  const handleRemoveFromWishlist = (itemId: string) => {
      removeFromWishlist(itemId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar 
        formData={formData}
        onFormDataChange={handleFormDataChange} 
        onEventDateChange={handleEventDateChange}
        onPickupReturnDateChange={handlePickupReturnDateChange}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        isScrolled={isScrolled}
        isSearchExpanded={isSearchExpanded}
        onToggleSearchExpand={toggleSearchExpand}
        eventDateText={
          formData.eventStartDate
            ? `${format(formData.eventStartDate, 'MMM d')} ${formData.eventEndDate ? `- ${format(formData.eventEndDate, 'MMM d')}` : ''}` 
            : 'Event Dates'
        }
        pickupReturnDateText={
           formData.pickupDate
            ? `${format(formData.pickupDate, 'MMM d')} ${formData.returnDate ? `- ${format(formData.returnDate, 'MMM d')}` : ''}`
            : 'Pickup & Return'
        }
        cartItems={cartItems}
        removeFromCart={handleRemoveFromCart}
        clearCart={clearCart}
        getTotalQuantity={getTotalQuantity}
        wishlistItems={wishlistItems}
        removeFromWishlist={handleRemoveFromWishlist}
      />
      
      {isScrolled && isSearchExpanded && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-40 z-10" 
          onClick={() => setIsSearchExpanded(false)}
        ></div>
      )}
      
      <div className={`flex-1 transition-all duration-300 ${isScrolled && isSearchExpanded ? 'filter blur-sm' : ''} ${(!isScrolled || isSearchExpanded) ? 'pt-[calc(5rem+76px+2rem)]' : 'pt-[calc(5rem+2rem)]'}`}>
        <div 
          className={`sticky z-20 transition-colors duration-200 ${ 
            isScrolled ? 'bg-white shadow-sm' : 'bg-transparent'
          }`}
          style={{ top: stickyTopOffset }}
        >
          <div className="max-w-7xl mx-auto">
             <ItemFilterBar 
                activeFilter={activeFilter} 
                onFilterChange={handleFilterChange} 
             />
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
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

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const cartQuantity = getItemQuantity(String(item.id));
                const isOutOfStock = item.available_quantity <= 0;
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
                          <p>Available: {item.available_quantity}</p>
                          <p>Total: {item.total_quantity}</p>
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
                          disabled={!isOutOfStock && cartQuantity >= item.available_quantity}
                          onClick={() => {
                            const input = document.getElementById(`quantity-${item.id}`) as HTMLInputElement;
                            const quantity = parseInt(input.value); 
                            if (quantity > 0) {
                              if (isOutOfStock) {
                                addToWishlist(item, quantity);
                                alert(`${quantity} x ${item.name} added to wishlist.`);
                              } else {
                                if (quantity <= item.available_quantity) {
                                  addToCart(item, quantity);
                                } else {
                                  alert(`Cannot add ${quantity} - only ${item.available_quantity} available.`);
                                  input.value = item.available_quantity.toString();
                                }
                              }
                              input.value = "1";
                            }
                          }}
                        >
                          {isOutOfStock ? 'Add to Wishlist' : (cartQuantity >= item.available_quantity ? 'Max in Cart' : 'Add to Cart')}
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
              <div className="fixed bottom-5 right-5 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50" role="alert">
                <strong className="font-bold">Error!</strong>
                <span className="block sm:inline"> {error}</span>
                <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
                  <X className="fill-current h-6 w-6 text-red-500" />
                </span>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}