import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Package2, ShoppingCart, ChevronUp, ChevronDown } from 'lucide-react';
import { useCart } from '../context/CartContext';
import type { PromoItem } from '../types';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import DatePickerInput from '../components/DatePickerInput';
import ItemCalendar from '../components/ItemCalendar';
import Navbar from '../components/Navbar';
import { format } from 'date-fns';

export default function HomePage() {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { items: cartItems, addToCart, removeFromCart, updateQuantity, getTotalQuantity, getItemQuantity, clearCart } = useCart();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    pickupDate: null as Date | null,
    returnDate: null as Date | null
  });

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
    fetchItems();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (cartItems.length === 0) {
      setError('Please add items to your cart before submitting');
      return;
    }

    if (!formData.name || !formData.email || !formData.pickupDate || !formData.returnDate) {
      setError('Please fill in all required fields');
      return;
    }

    if (!formData.email.toLowerCase().endsWith('@vellummortgage.com')) {
      setError('Please use your @vellummortgage.com email address');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const orderItems = cartItems.map(item => ({
        item_id: item.id,
        quantity: item.requestedQuantity
      }));

      // Create the order
      const { data, error: submitError } = await supabase.rpc(
        'create_order_with_checkouts',
        {
          p_checkout_date: formData.pickupDate.toISOString().split('T')[0],
          p_items: orderItems,
          p_return_date: formData.returnDate.toISOString().split('T')[0],
          p_user_email: formData.email,
          p_user_name: formData.name
        }
      );

      if (submitError) throw submitError;

      // Send email notification via Supabase Edge Function
      try {
        const { error: functionError } = await supabase.functions.invoke('send-order-notification', {
          body: { 
            orderId: data?.order_id || 'N/A', // Assuming the RPC returns an order_id
            customerName: formData.name,
            // Pass any other details the Edge Function expects
          }
        });
        if (functionError) {
          // Log the error but don't block the user flow
          console.error('Error invoking send-order-notification function:', functionError);
        }
      } catch (invokeError) {
        console.error('Failed to invoke send-order-notification function:', invokeError);
      }

      setFormData({
        name: '',
        email: '',
        pickupDate: null,
        returnDate: null
      });
      clearCart();
      
      await fetchItems();
      
      alert('Order submitted successfully! We will contact you via email with further instructions.');
    } catch (err: any) {
      console.error('Error submitting order:', err);
      setError(err.message || 'Failed to submit order');
    } finally {
      setIsSubmitting(false);
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Hero Section - Updated Background to Gradient */}
      <div className="bg-gradient-to-r from-[rgb(0,54,86)] to-[rgb(0,117,174)] text-white"> 
        {/* Remove the inner div for the image overlay */}
        {/* <div 
          className="absolute inset-0 bg-cover bg-center opacity-50" 
          style={{ backgroundImage: `url('/src/blue gradient 3.png')` }} 
        ></div> */}
        {/* Content container - remove relative/z-index */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Vellum Mortgage Event Items Store</h1>
          <p className="text-lg md:text-xl opacity-90 mb-6">
            Welcome! Use this tool to check out promotional items for your events. All items are free to use.
          </p>
          {/* Instructions box - revert opacity/blur for better contrast */}
          <div className="bg-white bg-opacity-10 p-4 rounded-lg text-sm">
            <h3 className="font-semibold mb-2">How to Use:</h3>
            <ol className="list-decimal list-inside space-y-1">
              <li>Browse available items below. Check availability and details.</li>
              <li>Enter the desired quantity and click "Add to Cart" for each item needed.</li>
              <li>Once all items are added, fill out your name, email, and desired pickup/return dates in the form at the bottom of the page.</li>
              <li>Click "Place Order". You'll receive an email confirmation shortly.</li>
            </ol>
          </div>
        </div>
      </div>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-36">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const cartQuantity = getItemQuantity(item.id);
            return (
              <div key={item.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
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

                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-semibold text-[#58595B]">{item.name}</h3>
                    <ItemCalendar itemId={item.id} itemName={item.name} />
                  </div>
                  <p className="text-[#58595B] opacity-80 mb-4">{item.description}</p>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-[#58595B] opacity-80">
                      <p>Available: {item.available_quantity}</p>
                      <p>Total: {item.total_quantity}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max={item.available_quantity}
                      defaultValue="1"
                      className="w-20 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      id={`quantity-${item.id}`}
                    />
                    <button
                      className="flex-1 bg-[#0075AE] text-white px-4 py-2 rounded-lg hover:bg-[#005f8c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={item.available_quantity <= 0 || cartQuantity >= item.available_quantity}
                      onClick={() => {
                        const input = document.getElementById(`quantity-${item.id}`) as HTMLInputElement;
                        const quantity = parseInt(input.value);
                        if (quantity > 0 && quantity <= item.available_quantity) {
                          addToCart(item, quantity);
                          input.value = "1";
                        } else if (quantity > item.available_quantity) {
                          alert(`Cannot add ${quantity} - only ${item.available_quantity} available.`);
                          input.value = item.available_quantity.toString();
                        }
                      }}
                    >
                      {item.available_quantity > 0 && cartQuantity < item.available_quantity ? 'Add to Cart' : 'Out of Stock'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Use custom upward shadow, white bg, thick border */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t-2 border-gray-300 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1),_0_-4px_6px_-4px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="flex items-end gap-6">
            <button
              type="button"
              onClick={() => setIsCartExpanded(!isCartExpanded)}
              className="flex items-center gap-2 px-4 py-2.5 text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="font-medium">{getTotalQuantity()} items</span>
              {isCartExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>

            <div className="flex-1 grid grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-medium text-[#58595B] mb-1.5">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="block w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Enter your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#58595B] mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="block w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="Enter your email"
                />
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-[#58595B] mb-1.5">Pickup Date</label>
                <DatePicker
                  selected={formData.pickupDate}
                  onChange={(date) => setFormData({ ...formData, pickupDate: date })}
                  minDate={new Date()}
                  required
                  customInput={
                    <DatePickerInput 
                      value={formData.pickupDate} 
                      placeholder="Select pickup date"
                      isActive={!!formData.pickupDate}
                    />
                  }
                  popperProps={{
                    positionFixed: true
                  }}
                  popperPlacement="top"
                  popperModifiers={[
                    {
                      name: "offset",
                      options: {
                        offset: [0, 4]
                      }
                    }
                  ]}
                />
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-[#58595B] mb-1.5">Return Date</label>
                <DatePicker
                  selected={formData.returnDate}
                  onChange={(date) => setFormData({ ...formData, returnDate: date })}
                  minDate={formData.pickupDate || new Date()}
                  required
                  customInput={
                    <DatePickerInput 
                      value={formData.returnDate} 
                      placeholder="Select return date"
                      isActive={!!formData.returnDate}
                    />
                  }
                  popperProps={{
                    positionFixed: true
                  }}
                  popperPlacement="top"
                  popperModifiers={[
                    {
                      name: "offset",
                      options: {
                        offset: [0, 4]
                      }
                    }
                  ]}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || cartItems.length === 0}
              className="px-6 py-2.5 bg-[#0075AE] text-white font-medium rounded-lg shadow-sm hover:bg-[#005f8c] focus:ring-2 focus:ring-offset-2 focus:ring-[#0075AE] disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isSubmitting ? 'Placing Order...' : 'Place Order'}
            </button>
          </form>

          {error && (
            <div className="mt-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {isCartExpanded && (
          <div className="border-t border-gray-200">
            <div className="max-w-7xl mx-auto px-4 py-4">
              {cartItems.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Your cart is empty</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cartItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-cover rounded"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center">
                              <Package2 className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium text-[#58595B]">{item.name}</h4>
                          <p className="text-sm text-gray-500">Qty: {item.requestedQuantity}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}