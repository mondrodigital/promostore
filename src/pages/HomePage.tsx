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
        const { error: functionError } = await supabase.functions.invoke('send-email', {
          body: { 
            orderId: data?.order_id || 'N/A', // Assuming the RPC returns an order_id
            customerName: formData.name,
            // Pass any other details the Edge Function expects
          }
        });
        if (functionError) {
          // Log the error but don't block the user flow
          console.error('Error invoking send-email function:', functionError);
        }
      } catch (invokeError) {
        console.error('Failed to invoke send-email function:', invokeError);
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
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const cartQuantity = getItemQuantity(item.id);
            return (
              <div key={item.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="aspect-w-16 aspect-h-9 relative">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                      <Package2 className="h-12 w-12 text-gray-400" />
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
                    <h3 className="text-xl font-semibold text-gray-900">{item.name}</h3>
                    <ItemCalendar itemId={item.id} itemName={item.name} />
                  </div>
                  <p className="text-gray-600 mb-4">{item.description}</p>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-gray-600">
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
                      className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={item.available_quantity === 0}
                      onClick={() => {
                        const input = document.getElementById(`quantity-${item.id}`) as HTMLInputElement;
                        const quantity = parseInt(input.value);
                        if (quantity > 0 && quantity <= item.available_quantity) {
                          addToCart(item, quantity);
                          input.value = "1";
                        }
                      }}
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pickup Date</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Return Date</label>
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
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
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
                          <h4 className="font-medium">{item.name}</h4>
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