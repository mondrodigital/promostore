import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import { format } from 'date-fns';
import { X, ShoppingCart, ChevronUp, ChevronDown, AlertCircle, History } from 'lucide-react';
import type { CartItem } from '../types';
import OrderHistoryModal from './OrderHistoryModal';
import { useGuestUser } from '../context/GuestUserContext';

interface BottomRequestBarProps {
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
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  getTotalQuantity: () => number;
  wishlistItems: CartItem[];
  removeFromWishlist: (itemId: string) => void;
  onReorderItems: (items: Array<{ id: string; quantity: number }>) => void;
}

export default function BottomRequestBar({
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
  onReorderItems,
}: BottomRequestBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [modalType, setModalType] = useState<'event' | 'pickup' | 'cart' | 'email_prompt' | null>(null);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [emailPromptInput, setEmailPromptInput] = useState('');
  const { guestEmail, setGuestEmail, clearGuestEmail } = useGuestUser();

  const totalCartQuantity = getTotalQuantity();
  const totalItems = totalCartQuantity + wishlistItems.length;

  // Check if form is complete
  const isFormComplete = () => {
    return (
      formData.name.trim() !== '' &&
      formData.email.trim() !== '' &&
      formData.eventStartDate !== null &&
      formData.eventEndDate !== null &&
      formData.pickupDate !== null &&
      formData.returnDate !== null
    );
  };

  // Handle request items button click
  const handleRequestClick = () => {
    if (totalItems === 0) {
      alert('Please add items to your cart or wishlist before submitting.');
      return;
    }

    if (!isFormComplete()) {
      setShowValidation(true);
      setIsExpanded(true);
      return;
    }

    // Form is complete, submit the order
    onSubmit();
  };

  // Handle date picker changes
  const handleModalDateChange = (dates: [Date | null, Date | null]) => {
    if (modalType === 'event') {
      onEventDateChange(dates);
    } else if (modalType === 'pickup') {
      onPickupReturnDateChange(dates);
    }
    const [start, end] = dates;
    if (start && end) {
      setModalType(null);
      setShowValidation(false);
    }
  };

  const getMissingFields = () => {
    const missing: string[] = [];
    if (!formData.name.trim()) missing.push('Name');
    if (!formData.email.trim()) missing.push('Email');
    if (!formData.eventStartDate || !formData.eventEndDate) missing.push('Event Dates');
    if (!formData.pickupDate || !formData.returnDate) missing.push('Pickup & Return Dates');
    return missing;
  };

  // Handle history button click
  const handleHistoryClick = () => {
    if (guestEmail) {
      // User email is cached, show order history directly
      setShowOrderHistory(true);
    } else {
      // Prompt for email
      setModalType('email_prompt');
      setEmailPromptInput('');
    }
  };

  // Handle email prompt submission
  const handleEmailPromptSubmit = () => {
    if (emailPromptInput.trim()) {
      // Save to guest email context
      setGuestEmail(emailPromptInput.trim());
      
      // Close prompt and show order history
      setModalType(null);
      setShowOrderHistory(true);
    }
  };

  // Handle sign out
  const handleSignOut = () => {
    clearGuestEmail();
    setShowOrderHistory(false);
  };

  return (
    <>
      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-2xl">
        <div className="mx-auto max-w-7xl">
          {/* Collapsed View */}
          {!isExpanded && (
            <div className="flex items-center justify-between px-4 py-3 sm:px-6">
              {/* Left: Cart Info & History */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModalType('cart')}
                  className="flex items-center gap-3 hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors"
                >
                  <div className="relative">
                    <ShoppingCart className="h-6 w-6 text-gray-700" />
                    {totalItems > 0 && (
                      <div className="absolute -top-2 -right-2 bg-[#0075AE] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {totalItems}
                      </div>
                    )}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-sm font-medium text-gray-900">
                      {totalItems} {totalItems === 1 ? 'Item' : 'Items'}
                    </p>
                    <p className="text-xs text-gray-500">View cart</p>
                  </div>
                </button>
                
                {/* History Icon */}
                <button
                  onClick={handleHistoryClick}
                  className="p-2 hover:bg-gray-50 rounded-lg transition-colors group"
                  title="Order History"
                >
                  <History className="h-6 w-6 text-gray-600 group-hover:text-[#0075AE]" />
                </button>
              </div>

              {/* Center: Expand Button (Mobile only) */}
              <button
                onClick={() => setIsExpanded(true)}
                className="sm:hidden text-gray-500 hover:text-gray-700"
              >
                <ChevronUp className="h-5 w-5" />
              </button>

              {/* Right: Request Items Button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsExpanded(true)}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <span>Fill Details</span>
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={handleRequestClick}
                  disabled={isSubmitting || totalItems === 0}
                  className="bg-[#0075AE] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[#005f8c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="text-sm sm:text-base">
                    {isSubmitting ? 'Submitting...' : 'Request Items'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Expanded View */}
          {isExpanded && (
            <div className="px-4 py-4 sm:px-6 max-h-[70vh] overflow-y-auto">
              {/* Header with Close Button */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Complete Your Request</h3>
                <button
                  onClick={() => {
                    setIsExpanded(false);
                    setShowValidation(false);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>

              {/* Validation Alert */}
              {showValidation && getMissingFields().length > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">Please complete all required fields:</p>
                    <p className="text-sm text-amber-700 mt-1">{getMissingFields().join(', ')}</p>
                  </div>
                </div>
              )}

              {/* Form Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={formData.name}
                    onChange={(e) => {
                      onFormDataChange('name', e.target.value);
                      setShowValidation(false);
                    }}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none ${
                      showValidation && !formData.name.trim() ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="your.email@vellummortgage.com"
                    value={formData.email}
                    onChange={(e) => {
                      onFormDataChange('email', e.target.value);
                      setShowValidation(false);
                    }}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none ${
                      showValidation && !formData.email.trim() ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                </div>

                {/* Event Dates */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event Dates <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setModalType('event')}
                    className={`w-full px-3 py-2 border rounded-lg text-left focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none ${
                      showValidation && (!formData.eventStartDate || !formData.eventEndDate)
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                    } ${formData.eventStartDate ? 'text-gray-900' : 'text-gray-400'}`}
                  >
                    {formData.eventStartDate
                      ? `${format(formData.eventStartDate, 'MMM d')}${
                          formData.eventEndDate ? ` - ${format(formData.eventEndDate, 'MMM d, yyyy')}` : ''
                        }`
                      : 'Select event dates'}
                  </button>
                </div>

                {/* Pickup & Return Dates */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pickup & Return Dates <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setModalType('pickup')}
                    className={`w-full px-3 py-2 border rounded-lg text-left focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none ${
                      showValidation && (!formData.pickupDate || !formData.returnDate)
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                    } ${formData.pickupDate ? 'text-gray-900' : 'text-gray-400'}`}
                  >
                    {formData.pickupDate
                      ? `${format(formData.pickupDate, 'MMM d')}${
                          formData.returnDate ? ` - ${format(formData.returnDate, 'MMM d, yyyy')}` : ''
                        }`
                      : 'Select pickup & return dates'}
                  </button>
                </div>
              </div>

              {/* Cart Summary */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <button
                  onClick={() => setModalType('cart')}
                  className="w-full flex items-center justify-between hover:bg-gray-100 p-2 rounded transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      {totalCartQuantity > 0 && `${totalCartQuantity} checkout item${totalCartQuantity > 1 ? 's' : ''}`}
                      {totalCartQuantity > 0 && wishlistItems.length > 0 && ', '}
                      {wishlistItems.length > 0 && `${wishlistItems.length} wishlist item${wishlistItems.length > 1 ? 's' : ''}`}
                      {totalItems === 0 && 'No items added yet'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">Click to view</span>
                </button>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleRequestClick}
                disabled={isSubmitting || totalItems === 0}
                className="w-full bg-[#0075AE] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#005f8c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Submitting Request...' : 'Submit Request'}
              </button>

              <p className="text-xs text-gray-500 text-center mt-2">
                You'll receive confirmation via email with calendar invites
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setModalType(null)}></div>

          {/* Modal Content */}
          <div className="relative bg-white p-6 rounded-lg shadow-xl z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <button onClick={() => setModalType(null)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700">
              <X className="h-5 w-5" />
            </button>

            {/* Date Picker Modal */}
            {(modalType === 'event' || modalType === 'pickup') && (
              <>
                <h3 className="text-lg font-semibold mb-4 text-center">
                  {modalType === 'event' ? 'Select Event Dates' : 'Select Pickup & Return Dates'}
                </h3>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  {modalType === 'event'
                    ? 'When is your event taking place?'
                    : 'When will you pick up and return the items?'}
                </p>
                <div className="flex justify-center">
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
                </div>
              </>
            )}

            {/* Cart/Wishlist Modal */}
            {modalType === 'cart' && (
              <>
                <h3 className="text-lg font-semibold mb-4 text-center">Your Request</h3>
                <div className="space-y-6">
                  {/* Cart Items Section */}
                  <div>
                    <h4 className="text-md font-medium text-gray-800 mb-3 border-b pb-2">
                      Items to Checkout ({cartItems.length})
                    </h4>
                    {cartItems.length === 0 ? (
                      <p className="text-sm text-gray-500 italic pl-2">No items added to checkout yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {cartItems.map((item) => (
                          <div key={`cart-${item.id}`} className="flex items-center gap-3 bg-green-50 p-3 rounded-lg border border-green-200">
                            {item.image_url && (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-16 h-16 object-cover rounded flex-shrink-0"
                              />
                            )}
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900">{item.name}</h5>
                              <p className="text-sm text-gray-600">Quantity: {item.requestedQuantity}</p>
                            </div>
                            <button
                              onClick={() => removeFromCart(String(item.id))}
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
                        <button onClick={clearCart} className="text-xs text-red-600 hover:underline">
                          Clear all checkout items
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Wishlist Items Section */}
                  <div>
                    <h4 className="text-md font-medium text-gray-800 mb-3 border-b pb-2">
                      Wishlist Items ({wishlistItems.length})
                    </h4>
                    {wishlistItems.length === 0 ? (
                      <p className="text-sm text-gray-500 italic pl-2">No items in wishlist.</p>
                    ) : (
                      <div className="space-y-3">
                        {wishlistItems.map((item) => (
                          <div
                            key={`wishlist-${item.id}`}
                            className="flex items-center gap-3 bg-orange-50 p-3 rounded-lg border border-orange-200"
                          >
                            {item.image_url && (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-16 h-16 object-cover rounded flex-shrink-0"
                              />
                            )}
                            <div className="flex-1">
                              <h5 className="font-medium text-orange-900">{item.name}</h5>
                              <p className="text-sm text-orange-700">Requested: {item.requestedQuantity}</p>
                              <p className="text-xs text-orange-600 mt-1">Currently unavailable</p>
                            </div>
                            <button
                              onClick={() => removeFromWishlist(String(item.id))}
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

                {wishlistItems.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-gray-600">
                      <strong>Note:</strong> Wishlist items are currently checked out by someone else. We'll notify marketing to coordinate availability for your dates.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Email Prompt Modal */}
            {modalType === 'email_prompt' && (
              <>
                <h3 className="text-lg font-semibold mb-4 text-center">View Your Order History</h3>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  Enter your email to view your past orders. We'll remember you for next time!
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="your.email@vellummortgage.com"
                      value={emailPromptInput}
                      onChange={(e) => setEmailPromptInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleEmailPromptSubmit();
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none"
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={handleEmailPromptSubmit}
                    disabled={!emailPromptInput.trim()}
                    className="w-full bg-[#0075AE] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#005f8c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    View Order History
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    Your email will be saved locally for convenience
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Order History Modal */}
      {showOrderHistory && guestEmail && (
        <OrderHistoryModal
          isOpen={showOrderHistory}
          onClose={() => setShowOrderHistory(false)}
          userEmail={guestEmail}
          onReorder={onReorderItems}
          onSignOut={handleSignOut}
        />
      )}
    </>
  );
}

