import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Package2, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useGuestUser } from '../context/GuestUserContext';
import { useToast } from '../context/ToastContext';
import type { PromoItem, CartItem } from '../types';
import "react-datepicker/dist/react-datepicker.css";
import ItemCalendar from '../components/ItemCalendar';
import SimpleNavbar from '../components/SimpleNavbar';
import BottomRequestBar from '../components/BottomRequestBar';
import ItemFilterBar from '../components/ItemFilterBar';
import {
  validateCartAvailability,
  createOrder,
  createCheckoutRecords,
  saveWishlistItems,
  sendOrderNotifications,
  sendPowerAutomateWebhook,
  type OrderFormData
} from '../services/orderService';

type Category = 'All' | 'Tents' | 'Tables' | 'Linens' | 'Displays' | 'Decor' | 'Games' | 'Misc';



export default function HomePage() {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleSubmit = async () => {
    // Validate required form data
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

    setIsSubmitting(true);
    setError(null);

    try {
      // Validate cart availability before proceeding
      if (cartItems.length > 0) {
        const validation = await validateCartAvailability(cartItems);
        
        if (!validation.isValid) {
          // Handle unavailable items
          if (validation.unavailableItems.length > 0) {
            const itemNames = validation.unavailableItems.map(i => i.name).join(', ');
            showWarning(`Some items are no longer available: ${itemNames}. They have been moved to your wishlist.`);
            
            // Move unavailable items to wishlist
            validation.unavailableItems.forEach(item => {
              removeFromCart(String(item.id));
              addToWishlist(item, item.requestedQuantity);
            });
          }
          
          // Handle items with reduced availability
          if (validation.staleItems.length > 0) {
            const staleInfo = validation.staleItems
              .map(s => `${s.item.name} (only ${s.currentAvailable} available)`)
              .join(', ');
            showWarning(`Quantities adjusted for: ${staleInfo}`);
            
            // Adjust quantities in cart
            validation.staleItems.forEach(staleItem => {
              if (staleItem.currentAvailable > 0) {
                // Update cart with available quantity
                removeFromCart(String(staleItem.item.id));
                addToCart(staleItem.item as PromoItem, staleItem.currentAvailable);
                // Add remainder to wishlist
                const remainder = staleItem.requestedQuantity - staleItem.currentAvailable;
                if (remainder > 0) {
                  addToWishlist(staleItem.item as PromoItem, remainder);
                }
              } else {
                // Move entire item to wishlist
                removeFromCart(String(staleItem.item.id));
                addToWishlist(staleItem.item as PromoItem, staleItem.requestedQuantity);
              }
            });
          }
          
          // Re-check if we still have cart items after adjustments
          if (cartItems.length === 0 && wishlistItems.length === 0) {
            showError('No items available for checkout. Please try again later.');
            setIsSubmitting(false);
            return;
          }
          
          // Let user review the adjusted cart before submitting
          showInfo('Cart has been adjusted. Please review and submit again.');
          setIsSubmitting(false);
          return;
        }
      }

      const orderFormData: OrderFormData = formData;
      let orderId: string | null = null;
      let orderNumber: string | null = null;
      let orderSuccessful = false;
      let wishlistSaved = false;

      // Create order
      if (cartItems.length > 0) {
        const orderResult = await createOrder(orderFormData, 'pending');
        orderId = orderResult.orderId;
        orderNumber = orderResult.orderNumber;
        
        await createCheckoutRecords(orderId, cartItems);
        orderSuccessful = true;
      } else if (wishlistItems.length > 0) {
        const orderResult = await createOrder(orderFormData, 'wishlist_only');
        orderId = orderResult.orderId;
        orderNumber = orderResult.orderNumber;
      }

      // Save wishlist items
      if (wishlistItems.length > 0 && orderId) {
        await saveWishlistItems(orderId, wishlistItems, orderFormData);
        wishlistSaved = true;
      }

      // Send notifications
      if ((orderSuccessful || wishlistSaved) && orderId) {
        await sendOrderNotifications(orderId, orderNumber, orderFormData, cartItems, wishlistItems);
        
        if (orderSuccessful) {
          await sendPowerAutomateWebhook(orderId, orderNumber, orderFormData);
        }
      }

      // Cache guest email
      if (guestEmail !== formData.email) {
        setGuestEmail(formData.email);
      }

      // Reset form and cart
      setFormData({ name: '', email: '', pickupDate: null, returnDate: null, eventStartDate: null, eventEndDate: null });
      clearCart();
      clearWishlist();
      await fetchItems();

      // Show success message
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
          const availableQuantity = itemData.available_quantity;
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
                              
                              if (totalRequested <= item.available_quantity) {
                                addToCart(item, quantity);
                                showSuccess(`${item.name} added to cart`);
                              } else {
                                const maxAddable = item.available_quantity - currentInCart;
                                if (maxAddable > 0) {
                                  showWarning(`Only ${maxAddable} more available. Adjusted quantity.`);
                                  addToCart(item, maxAddable);
                                } else {
                                  showWarning(`Maximum quantity already in cart`);
                                }
                              }
                            }
                            input.value = "1";
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
        cartItems={cartItems}
        removeFromCart={removeFromCart}
        clearCart={clearCart}
        getTotalQuantity={getTotalQuantity}
        wishlistItems={wishlistItems}
        removeFromWishlist={removeFromWishlist}
        onReorderItems={handleReorderItems}
      />
    </div>
  );
}