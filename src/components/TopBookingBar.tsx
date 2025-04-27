import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { Search, X, ShoppingCart } from 'lucide-react';
import type { CartItem } from '../types';

interface TopBookingBarProps {
  formData: {
    name: string;
    email: string;
    pickupDate: Date | null;
    returnDate: Date | null;
    eventStartDate: Date | null;
    eventEndDate: Date | null;
  };
  onFormDataChange: (field: string, value: any) => void;
  onEventDateChange: (dates: [Date | null, Date | null]) => void;
  onPickupReturnDateChange: (dates: [Date | null, Date | null]) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  cartItems: CartItem[];
  removeFromCart: (itemId: number) => void;
  clearCart: () => void;
  getTotalQuantity: () => number;
  wishlistItems: CartItem[];
  removeFromWishlist: (itemId: string) => void;
}

export default function TopBookingBar({
  formData,
  onFormDataChange,
  onEventDateChange,
  onPickupReturnDateChange,
  onSubmit,
  isSubmitting,
  cartItems,
  removeFromCart,
  clearCart,
  getTotalQuantity,
  wishlistItems,
  removeFromWishlist,
}: TopBookingBarProps) {
  // State to manage which modal is open ('event', 'pickup', 'cart', or null)
  const [modalType, setModalType] = useState<'event' | 'pickup' | 'cart' | null>(null);

  // Display text logic remains the same
  const eventDateText = formData.eventStartDate ? `${format(formData.eventStartDate, 'MMM d')} ${formData.eventEndDate ? `- ${format(formData.eventEndDate, 'MMM d')}` : ''}` : 'Add dates';
  const pickupReturnDateText = formData.pickupDate ? `${format(formData.pickupDate, 'MMM d')} ${formData.returnDate ? `- ${format(formData.returnDate, 'MMM d')}` : ''}` : 'Add dates';

  // Handlers for the inline DatePicker inside the modal
  const handleModalDateChange = (dates: [Date | null, Date | null]) => {
    if (modalType === 'event') {
      onEventDateChange(dates);
    } else if (modalType === 'pickup') {
      onPickupReturnDateChange(dates);
    }
    // Close logic for dates
    const [start, end] = dates;
     if (start && end) {
        setModalType(null);
     } else if (modalType === 'event' && start && !formData.eventEndDate) {
     } else if (modalType === 'pickup' && start && !formData.returnDate) {
     } else if (!start && !end) {
     }
  };

  const totalCartQuantity = getTotalQuantity(); // Get total quantity

  return (
    <> {/* Fragment needed to return multiple top-level elements (bar + modal) */}
      <div className="sticky top-20 z-20 bg-white shadow-md mb-6 mx-auto max-w-5xl rounded-full border border-gray-200">
        <div className="flex items-center justify-between divide-x divide-gray-200">
          {/* Name Section */}
          <div className="flex-1 px-4 py-3 hover:bg-gray-50 rounded-l-full cursor-pointer">
            <label className="block text-xs font-semibold text-gray-700">Name</label>
            <input
              type="text"
              placeholder="Your Name"
              value={formData.name}
              onChange={(e) => onFormDataChange('name', e.target.value)}
              className="text-sm text-gray-500 bg-transparent outline-none w-full placeholder-gray-400"
            />
          </div>

          {/* Email Section */}
          <div className="flex-1 px-4 py-3 hover:bg-gray-50 cursor-pointer">
            <label className="block text-xs font-semibold text-gray-700">Email</label>
            <input
              type="email"
              placeholder="Your Email"
              value={formData.email}
              onChange={(e) => onFormDataChange('email', e.target.value)}
              className="text-sm text-gray-500 bg-transparent outline-none w-full placeholder-gray-400"
            />
          </div>

          {/* Event Dates Button */}
          <button
            type="button"
            onClick={() => setModalType('event')}
            className="flex-1 w-full text-left px-4 py-3 hover:bg-gray-50"
          >
            <span className="block text-xs font-semibold text-gray-700">Event Dates</span>
            <span className={`text-sm ${formData.eventStartDate ? 'text-gray-900' : 'text-gray-400'}`}>
              {formData.eventStartDate ? `${format(formData.eventStartDate, 'MMM d')} ${formData.eventEndDate ? `- ${format(formData.eventEndDate, 'MMM d')}` : ''}` : 'Add dates'}
            </span>
          </button>

          {/* Pickup/Return Dates Button */}
           <button
             type="button"
             onClick={() => setModalType('pickup')}
             className="flex-1 w-full text-left px-4 py-3 hover:bg-gray-50" // Remove rounded-r-full here if Place Order is next
           >
            <span className="block text-xs font-semibold text-gray-700">Pickup & Return</span>
             <span className={`text-sm ${formData.pickupDate ? 'text-gray-900' : 'text-gray-400'}`}>
              {formData.pickupDate ? `${format(formData.pickupDate, 'MMM d')} ${formData.returnDate ? `- ${format(formData.returnDate, 'MMM d')}` : ''}` : 'Add dates'}
            </span>
           </button>

          {/* Cart Items Button */} 
          <button 
            type="button"
            onClick={() => setModalType('cart')} 
            className="flex-1 w-full text-left px-4 py-3 hover:bg-gray-50 relative"
          >
            <span className="block text-xs font-semibold text-gray-700">Items</span>
            <span className={`text-sm ${totalCartQuantity > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                {totalCartQuantity > 0 ? `${totalCartQuantity} item${totalCartQuantity > 1 ? 's' : ''}` : 'Add items'}
            </span>
            {/* Badge */} 
            {totalCartQuantity > 0 && (
              <div className="absolute top-1 right-2 bg-red-500 text-white text-[10px] leading-tight font-medium rounded-full w-4 h-4 flex items-center justify-center">
                {totalCartQuantity}
              </div>
            )}
          </button>

          {/* Place Order Button */}
          <div className="px-4 py-2"> {/* Adjusted padding maybe */}
            <button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="bg-[#0075AE] text-white rounded-full px-4 py-2.5 flex items-center gap-2 hover:bg-[#005f8c] disabled:opacity-50 transition-colors"
            >
              <Search className="h-4 w-4" />
              <span className="text-sm font-medium">
                {isSubmitting ? 'Placing Order...' : 'Place Order'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Container */} 
      {modalType && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          {/* Overlay */}
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setModalType(null)}></div>

          {/* Modal Content */}
          <div className="relative bg-white p-6 rounded-lg shadow-xl z-50 w-full max-w-lg mx-4">
             <button onClick={() => setModalType(null)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700">
               <X className="h-5 w-5" />
             </button>
             
             {/* Date Picker Modal Content */}
             {(modalType === 'event' || modalType === 'pickup') && (
                <>
                   <h3 className="text-lg font-semibold mb-4 text-center">
                     {modalType === 'event' ? 'Select Event Dates' : 'Select Pickup & Return Dates'}
                   </h3>
                   <DatePicker
                      selected={modalType === 'event' ? formData.eventStartDate : formData.pickupDate}
                      onChange={handleModalDateChange}
                      startDate={modalType === 'event' ? formData.eventStartDate : formData.pickupDate}
                      endDate={modalType === 'event' ? formData.eventEndDate : formData.returnDate}
                      selectsRange={true}
                      inline
                      monthsShown={2}
                      minDate={new Date()}
                   />
                </>
             )}

             {/* Cart/Wishlist Modal Content */} 
             {modalType === 'cart' && (
                <>
                   <h3 className="text-lg font-semibold mb-4 text-center">Your Request</h3>
                   <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                      {/* Cart Items Section */}
                      <div>
                         <h4 className="text-md font-medium text-gray-800 mb-3 border-b pb-2">Items to Checkout</h4>
                         {cartItems.length === 0 ? (
                            <p className="text-sm text-gray-500 italic pl-2">No items added to checkout yet.</p>
                         ) : (
                            <div className="space-y-3">
                               {cartItems.map(item => (
                                  <div key={`cart-${item.id}`} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                                     <div>
                                        <h5 className="font-medium text-[#58595B]">{item.name}</h5>
                                        <p className="text-sm text-gray-500">Qty: {item.requestedQuantity}</p>
                                     </div>
                                     <button
                                        onClick={() => removeFromCart(String(item.id))} // Use string ID
                                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                                     >
                                        Remove
                                     </button>
                                  </div>
                               ))}
                            </div>
                         )}
                         {cartItems.length > 0 && (
                           <div className="pt-4 text-right">
                              <button
                                 onClick={clearCart}
                                 className="text-xs text-red-600 hover:underline"
                               >
                                 Clear Checkout Items
                              </button>
                           </div>
                          )}
                      </div>

                      {/* Wishlist Items Section */}
                      <div>
                         <h4 className="text-md font-medium text-gray-800 mb-3 border-b pb-2">Wishlist Items (Currently Unavailable)</h4>
                         {wishlistItems.length === 0 ? (
                            <p className="text-sm text-gray-500 italic pl-2">No items added to wishlist.</p>
                         ) : (
                           <div className="space-y-3">
                              {wishlistItems.map(item => (
                                 <div key={`wishlist-${item.id}`} className="flex items-center justify-between bg-orange-50 p-3 rounded-lg border border-orange-200">
                                    <div>
                                       <h5 className="font-medium text-orange-800">{item.name}</h5>
                                       <p className="text-sm text-orange-700">Requested Qty: {item.requestedQuantity}</p>
                                    </div>
                                    <button
                                       onClick={() => removeFromWishlist(String(item.id))} // Use string ID
                                       className="text-red-600 hover:text-red-700 text-sm font-medium"
                                    >
                                       Remove
                                    </button>
                                 </div>
                              ))}
                           </div>
                         )}
                         {/* Optional: Add Clear Wishlist Button */}
                         {/* {wishlistItems.length > 0 && ( ... clear button ... )} */} 
                      </div>
                   </div>
                   {/* Add note about wishlist */}
                   {wishlistItems.length > 0 && (
                      <p className="text-xs text-gray-500 mt-4 pt-4 border-t">
                         Note: Wishlisted items are currently checked out. We will attempt to coordinate with the current borrower but cannot guarantee availability for your dates.
                      </p>
                   )}
                </>
             )}
          </div>
        </div>
      )}
    </>
  );
}

// Add CSS for airbnb-datepicker (in index.css or similar):
/*
.airbnb-datepicker .react-datepicker {
  border: none; // Remove default border
  box-shadow: none; // Remove default shadow if wrapper has it
  display: flex; // Arrange months side-by-side
}
.airbnb-datepicker .react-datepicker__month-container {
  padding: 0 1rem; // Add padding between months
}
*/ 