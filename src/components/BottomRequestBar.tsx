import { useState } from 'react';
import { format } from 'date-fns';
import { X, ShoppingCart, ChevronUp, ChevronDown, History, Info, Pencil, CalendarRange } from 'lucide-react';
import type { CartItem } from '../types';
import OrderHistoryModal from './OrderHistoryModal';
import AvailabilityInfo from './AvailabilityInfo';
import { useGuestUser } from '../context/GuestUserContext';
import type { DateAwareAvailability } from '../services/orderService';

interface BottomRequestBarProps {
  formData: {
    name: string;
    email: string;
    pickupDate: Date | null;
    returnDate: Date | null;
    eventStartDate: Date | null;
    eventEndDate: Date | null;
  };
  /** Re-open the upfront EventDetailsModal so the user can change name/email/dates. */
  onEditDetails: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  /** Seconds remaining in the post-submission cooldown period (0 = not cooling down). */
  submitCooldown?: number;
  cartItems: CartItem[];
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  getTotalQuantity: () => number;
  wishlistItems: CartItem[];
  removeFromWishlist: (itemId: string) => void;
  onReorderItems: (items: Array<{ id: string; quantity: number }>) => void;
  // Date-aware availability map for the currently-selected pickup/return window.
  // Used to surface a non-blocking "heads up — N also reserved for these dates"
  // note next to cart items (issue #9). Empty / unused when dates not yet picked.
  dateAvailability?: Record<string, DateAwareAvailability>;
}

export default function BottomRequestBar({
  formData,
  onEditDetails,
  onSubmit,
  isSubmitting,
  submitCooldown = 0,
  cartItems,
  removeFromCart,
  clearCart,
  getTotalQuantity,
  wishlistItems,
  removeFromWishlist,
  onReorderItems,
  dateAvailability,
}: BottomRequestBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [modalType, setModalType] = useState<'cart' | 'email_prompt' | null>(null);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [emailPromptInput, setEmailPromptInput] = useState('');
  const { guestEmail, setGuestEmail, clearGuestProfile } = useGuestUser();

  const totalCartQuantity = getTotalQuantity();
  const totalItems = totalCartQuantity + wishlistItems.length;

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

  const handleRequestClick = () => {
    if (submitCooldown > 0) return;

    if (totalItems === 0) {
      alert('Please add items to your cart or wishlist before submitting.');
      return;
    }

    // Defensive: the upfront modal should have already collected these, but if
    // anything cleared them, send the user back to the popup instead of
    // surfacing inline errors here.
    if (!isFormComplete()) {
      onEditDetails();
      return;
    }

    onSubmit();
  };

  const handleHistoryClick = () => {
    if (guestEmail) {
      setShowOrderHistory(true);
    } else {
      setModalType('email_prompt');
      setEmailPromptInput('');
    }
  };

  const handleEmailPromptSubmit = () => {
    if (emailPromptInput.trim()) {
      setGuestEmail(emailPromptInput.trim());
      setModalType(null);
      setShowOrderHistory(true);
    }
  };

  const handleSignOut = () => {
    clearGuestProfile();
    setShowOrderHistory(false);
  };

  const formatRange = (start: Date | null, end: Date | null) => {
    if (!start) return 'Not set';
    if (!end) return format(start, 'MMM d, yyyy');
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  };

  const pickupRangeLabel = formatRange(formData.pickupDate, formData.returnDate);

  return (
    <>
      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-2xl">
        <div className="mx-auto max-w-7xl">
          {/* Collapsed View */}
          {!isExpanded && (
            <div className="flex items-center justify-between px-4 py-3 sm:px-6 gap-3">
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

                <button
                  onClick={handleHistoryClick}
                  className="p-2 hover:bg-gray-50 rounded-lg transition-colors group"
                  title="Order History"
                >
                  <History className="h-6 w-6 text-gray-600 group-hover:text-[#0075AE]" />
                </button>
              </div>

              {/* Center: Date pill / edit details button (always visible) */}
              <button
                onClick={onEditDetails}
                className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-[#0075AE] hover:bg-blue-50 transition-colors text-sm"
                title="Change event details"
              >
                <CalendarRange className="h-4 w-4 text-[#0075AE]" />
                <span className="font-medium text-gray-900">
                  {formData.pickupDate ? pickupRangeLabel : 'Set event details'}
                </span>
                <Pencil className="h-3.5 w-3.5 text-gray-400" />
              </button>

              {/* Mobile: compact edit-details icon */}
              <button
                onClick={onEditDetails}
                className="sm:hidden p-2 hover:bg-gray-50 rounded-lg transition-colors"
                title="Change event details"
                aria-label="Change event details"
              >
                <CalendarRange className="h-6 w-6 text-[#0075AE]" />
              </button>

              {/* Right: Expand toggle + Submit */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsExpanded(true)}
                  className="hidden sm:flex items-center gap-1 px-2 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  title="View details"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={handleRequestClick}
                  disabled={isSubmitting || submitCooldown > 0 || totalItems === 0}
                  className="bg-[#0075AE] text-white px-5 py-2.5 rounded-lg font-medium hover:bg-[#005f8c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <span className="text-sm sm:text-base">
                    {isSubmitting
                      ? 'Submitting...'
                      : submitCooldown > 0
                      ? `Wait ${submitCooldown}s…`
                      : 'Request Items'}
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
                <h3 className="text-lg font-semibold text-gray-900">Review Your Request</h3>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="text-gray-500 hover:text-gray-700"
                  aria-label="Collapse"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>

              {/* Read-only event details summary */}
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#0075AE]">
                      Event details
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Collected when you started. Tap edit to change.
                    </p>
                  </div>
                  <button
                    onClick={onEditDetails}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#0075AE] border border-[#0075AE] rounded-lg hover:bg-[#0075AE] hover:text-white transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit details
                  </button>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-gray-500">Name</dt>
                    <dd className="text-gray-900 font-medium">
                      {formData.name || <span className="text-amber-600">Not set</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Email</dt>
                    <dd className="text-gray-900 font-medium break-all">
                      {formData.email || <span className="text-amber-600">Not set</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Event dates</dt>
                    <dd className="text-gray-900 font-medium">
                      {formData.eventStartDate ? (
                        formatRange(formData.eventStartDate, formData.eventEndDate)
                      ) : (
                        <span className="text-amber-600">Not set</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Pickup &amp; return</dt>
                    <dd className="text-gray-900 font-medium">
                      {formData.pickupDate ? (
                        pickupRangeLabel
                      ) : (
                        <span className="text-amber-600">Not set</span>
                      )}
                    </dd>
                  </div>
                </dl>
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
                disabled={isSubmitting || submitCooldown > 0 || totalItems === 0}
                className="w-full bg-[#0075AE] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#005f8c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting
                  ? 'Submitting Request...'
                  : submitCooldown > 0
                  ? `Please wait ${submitCooldown}s before resubmitting…`
                  : 'Submit Request'}
              </button>

              <p className="text-xs text-gray-500 text-center mt-2">
                You'll receive confirmation via email with calendar invites
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cart / Email-prompt Modals */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setModalType(null)}></div>

          <div className="relative bg-white p-6 rounded-lg shadow-xl z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <button onClick={() => setModalType(null)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700">
              <X className="h-5 w-5" />
            </button>

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
                        {cartItems.map((item) => {
                          // Heads-up (#9): if dates are picked AND there are
                          // other active reservations overlapping our window,
                          // show a non-blocking note next to the line item.
                          const availabilityRow = dateAvailability?.[String(item.id)];
                          const datesPicked = !!(formData.pickupDate && formData.returnDate);
                          const overlapAmount = availabilityRow
                            ? Math.max(availabilityRow.totalQuantity - availabilityRow.availableQuantity, 0)
                            : 0;
                          const showOverlapNote = datesPicked && overlapAmount > 0;

                          return (
                            <div
                              key={`cart-${item.id}`}
                              className="flex flex-col gap-2 bg-green-50 p-3 rounded-lg border border-green-200"
                            >
                              <div className="flex items-center gap-3">
                                {item.image_url && (
                                  <img
                                    src={item.image_url}
                                    alt={item.name}
                                    className="w-16 h-16 object-cover rounded flex-shrink-0"
                                  />
                                )}
                                <div className="flex-1">
                                  <h5 className="font-medium text-gray-900">{item.name}</h5>
                                  <p className="text-sm text-gray-600">
                                    Quantity: {item.requestedQuantity}
                                    {availabilityRow && (
                                      <span className="text-gray-500">
                                        {' '}• {availabilityRow.availableQuantity} of {availabilityRow.totalQuantity} free for your dates
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <button
                                  onClick={() => removeFromCart(String(item.id))}
                                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                                >
                                  Remove
                                </button>
                              </div>
                              {showOverlapNote && formData.pickupDate && formData.returnDate && (
                                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                                  <span className="flex-1">
                                    Heads up: {overlapAmount} {overlapAmount === 1 ? 'unit is' : 'units are'} also reserved for overlapping dates.
                                  </span>
                                  <AvailabilityInfo
                                    itemId={String(item.id)}
                                    startDate={formData.pickupDate}
                                    endDate={formData.returnDate}
                                    label="View"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
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
