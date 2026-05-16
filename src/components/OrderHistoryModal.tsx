import React, { useState, useEffect } from 'react';
import { X, Package, Calendar, Clock, ChevronDown, ChevronUp, RefreshCw, LogOut, Hourglass, Ban, CalendarClock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format, parseISO, differenceInCalendarDays, isValid } from 'date-fns';

interface OrderHistoryItem {
  id: string;
  created_at: string;
  user_name: string;
  user_email: string;
  checkout_date: string | null;
  return_date: string | null;
  event_start_date?: string | null;
  event_end_date?: string | null;
  status: 'pending' | 'picked_up' | 'returned' | 'cancelled' | 'wishlist_only';
  order_number?: string;
  items: Array<{
    id: string;
    quantity: number;
    item: {
      id: string;
      name: string;
      image_url: string | null;
      category: string;
    };
  }>;
  associatedWishlistItems?: Array<{
    item: {
      name: string;
      image_url: string | null;
    };
    quantity: number;
    status: string;
    expires_at?: string | null;
    expired_notified_at?: string | null;
  }>;
}

interface OrderHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  onReorder: (items: Array<{ id: string; quantity: number }>) => void;
  onSignOut: () => void;
}

export default function OrderHistoryModal({ isOpen, onClose, userEmail, onReorder, onSignOut }: OrderHistoryModalProps) {
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Cancel order state
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Extension request state
  const [extensionOrderId, setExtensionOrderId] = useState<string | null>(null);
  const [requestedReturnDate, setRequestedReturnDate] = useState('');
  const [submittingExtension, setSubmittingExtension] = useState(false);
  const [extensionSubmittedIds, setExtensionSubmittedIds] = useState<Set<string>>(new Set());
  const [extensionError, setExtensionError] = useState<string | null>(null);

  const handleReorder = (order: OrderHistoryItem) => {
    const itemsToReorder = order.items.map(item => ({
      id: item.item.id,
      quantity: item.quantity
    }));
    onReorder(itemsToReorder);
    onClose();
  };

  const handleSignOut = () => {
    onSignOut();
    onClose();
  };

  useEffect(() => {
    if (isOpen && userEmail) {
      fetchOrderHistory();
    }
  }, [isOpen, userEmail]);

  const fetchOrderHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/get-orders-with-wishlists?email=${encodeURIComponent(userEmail)}`;

      const response = await fetch(edgeFunctionUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch orders');
      }

      const data = await response.json();
      const userOrders: OrderHistoryItem[] = data || [];
      userOrders.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setOrders(userOrders);
    } catch (err: unknown) {
      console.error('Error fetching order history:', err);
      setError('Unable to load order history. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Cancel order ─────────────────────────────────────────────────────────────

  const handleCancelClick = (orderId: string) => {
    setCancelConfirmId(orderId);
    setCancelError(null);
  };

  const handleCancelConfirm = async (order: OrderHistoryItem) => {
    setCancellingOrderId(order.id);
    setCancelError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('lo_cancel_order', {
        p_order_id: order.id,
        p_user_email: userEmail,
      });

      if (rpcError) throw rpcError;
      if (data && data.success === false) throw new Error(data.message || 'Cancellation failed');

      // Send cancel confirmation email (best-effort)
      try {
        await supabase.functions.invoke('send-cancel-confirmation', {
          body: {
            orderId: order.order_number || order.id,
            customerName: order.user_name,
            customerEmail: order.user_email,
          },
        });
      } catch (emailErr) {
        console.error('Cancel confirmation email failed (non-fatal):', emailErr);
      }

      setCancelConfirmId(null);
      // Refresh list to show updated status
      await fetchOrderHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel order';
      setCancelError(msg);
    } finally {
      setCancellingOrderId(null);
    }
  };

  // ── Extension request ────────────────────────────────────────────────────────

  const handleExtensionOpen = (orderId: string, currentReturnDate: string | null) => {
    setExtensionOrderId(orderId);
    setRequestedReturnDate(currentReturnDate ?? '');
    setExtensionError(null);
  };

  const handleExtensionSubmit = async (order: OrderHistoryItem) => {
    if (!requestedReturnDate) {
      setExtensionError('Please select a new return date');
      return;
    }

    setSubmittingExtension(true);
    setExtensionError(null);

    try {
      const { error: fnError } = await supabase.functions.invoke('send-extension-request', {
        body: {
          orderId: order.id,
          orderNumber: order.order_number,
          customerName: order.user_name,
          customerEmail: order.user_email,
          currentReturnDate: order.return_date
            ? format(new Date(order.return_date), 'MMM d, yyyy')
            : undefined,
          requestedReturnDate,
        },
      });

      if (fnError) throw fnError;

      setExtensionSubmittedIds(prev => new Set(prev).add(order.id));
      setExtensionOrderId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send extension request';
      setExtensionError(msg);
    } finally {
      setSubmittingExtension(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'picked_up':   return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'returned':    return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':   return 'bg-red-100 text-red-800 border-red-200';
      case 'wishlist_only': return 'bg-orange-100 text-orange-800 border-orange-200';
      default:            return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':       return 'Pending';
      case 'picked_up':    return 'Picked Up';
      case 'returned':     return 'Returned';
      case 'cancelled':    return 'Cancelled';
      case 'wishlist_only': return 'Wishlist Only';
      default:             return status;
    }
  };

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
    // Close any inline panels when collapsing
    if (expandedOrderId === orderId) {
      setCancelConfirmId(null);
      setExtensionOrderId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>

      {/* Modal Content */}
      <div className="relative bg-white rounded-lg shadow-xl z-50 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Order History</h2>
            <p className="text-sm text-gray-600 mt-1">{userEmail}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign out and use a different email"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors p-2"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0075AE]"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-red-600 text-sm">{error}</div>
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="text-center py-12">
              <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
              <p className="text-gray-500">Your order history will appear here once you make a request.</p>
            </div>
          )}

          {!loading && !error && orders.length > 0 && (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
                >
                  {/* Order Summary */}
                  <div className="p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => toggleOrderExpansion(order.id)}
                        className="flex-1 text-left hover:opacity-80 transition-opacity"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-semibold text-gray-900">
                            {order.order_number || '—'}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                            {getStatusLabel(order.status)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{format(new Date(order.created_at), 'MMM d, yyyy')}</span>
                          </div>
                          {order.checkout_date && order.return_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              <span>
                                {format(new Date(order.checkout_date), 'MMM d')} – {format(new Date(order.return_date), 'MMM d')}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Package className="h-4 w-4" />
                            <span>
                              {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                              {order.associatedWishlistItems && order.associatedWishlistItems.length > 0 &&
                                `, ${order.associatedWishlistItems.length} wishlist`}
                            </span>
                          </div>
                        </div>
                      </button>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 ml-4">
                        {/* Reorder */}
                        {order.items.length > 0 && (
                          <button
                            onClick={() => handleReorder(order)}
                            className="flex items-center gap-2 px-3 py-2 bg-[#0075AE] text-white rounded-lg hover:bg-[#005f8c] transition-colors text-sm font-medium"
                            title="Add these items to your cart"
                          >
                            <RefreshCw className="h-4 w-4" />
                            <span className="hidden sm:inline">Reorder</span>
                          </button>
                        )}

                        {/* Cancel (pending only) */}
                        {order.status === 'pending' && (
                          <button
                            onClick={() => {
                              toggleOrderExpansion(order.id);
                              handleCancelClick(order.id);
                            }}
                            className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                            title="Cancel this order"
                          >
                            <Ban className="h-4 w-4" />
                            <span className="hidden sm:inline">Cancel</span>
                          </button>
                        )}

                        {/* Request Extension (picked_up only) */}
                        {order.status === 'picked_up' && (
                          extensionSubmittedIds.has(order.id) ? (
                            <span className="flex items-center gap-1 px-3 py-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg font-medium">
                              <CalendarClock className="h-4 w-4" />
                              <span className="hidden sm:inline">Requested</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                toggleOrderExpansion(order.id === expandedOrderId ? '' : order.id);
                                handleExtensionOpen(order.id, order.return_date);
                              }}
                              className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                              title="Request a return date extension"
                            >
                              <CalendarClock className="h-4 w-4" />
                              <span className="hidden sm:inline">Extend</span>
                            </button>
                          )
                        )}

                        <button
                          onClick={() => toggleOrderExpansion(order.id)}
                          className="p-2 hover:bg-gray-200 rounded transition-colors"
                        >
                          {expandedOrderId === order.id ? (
                            <ChevronUp className="h-5 w-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedOrderId === order.id && (
                    <div className="p-4 bg-white border-t border-gray-200 space-y-4">

                      {/* Cancel confirmation panel */}
                      {cancelConfirmId === order.id && order.status === 'pending' && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                          <p className="text-sm font-medium text-red-800 mb-3">
                            Are you sure you want to cancel order <strong>{order.order_number || order.id}</strong>? This cannot be undone.
                          </p>
                          {cancelError && (
                            <p className="text-xs text-red-700 mb-2">{cancelError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCancelConfirm(order)}
                              disabled={cancellingOrderId === order.id}
                              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {cancellingOrderId === order.id ? 'Cancelling…' : 'Yes, Cancel Order'}
                            </button>
                            <button
                              onClick={() => setCancelConfirmId(null)}
                              disabled={cancellingOrderId === order.id}
                              className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                            >
                              Keep Order
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Extension request panel */}
                      {extensionOrderId === order.id && order.status === 'picked_up' && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                          <p className="text-sm font-medium text-blue-900 mb-3">
                            Request a return date extension for order <strong>{order.order_number || order.id}</strong>.
                          </p>
                          <label className="block text-sm text-blue-800 mb-1 font-medium">
                            Requested new return date
                          </label>
                          <input
                            type="date"
                            value={requestedReturnDate}
                            min={order.return_date ?? undefined}
                            onChange={e => setRequestedReturnDate(e.target.value)}
                            className="block w-full sm:w-64 border border-blue-300 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                          {extensionError && (
                            <p className="text-xs text-red-700 mb-2">{extensionError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleExtensionSubmit(order)}
                              disabled={submittingExtension}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {submittingExtension ? 'Sending…' : 'Send Request'}
                            </button>
                            <button
                              onClick={() => setExtensionOrderId(null)}
                              disabled={submittingExtension}
                              className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Submitted extension acknowledgement (inline) */}
                      {extensionSubmittedIds.has(order.id) && extensionOrderId !== order.id && (
                        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-medium">
                          Extension requested — the admin team will follow up with you.
                        </div>
                      )}

                      {/* Event Dates */}
                      {order.event_start_date && order.event_end_date && (
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm font-medium text-blue-900">Event Dates</p>
                          <p className="text-sm text-blue-700">
                            {format(new Date(order.event_start_date), 'MMM d, yyyy')} – {format(new Date(order.event_end_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      )}

                      {/* Checkout Items */}
                      {order.items.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Items Checked Out</h4>
                          <div className="space-y-2">
                            {order.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200"
                              >
                                {item.item.image_url && (
                                  <img
                                    src={item.item.image_url}
                                    alt={item.item.name}
                                    className="w-12 h-12 object-cover rounded"
                                  />
                                )}
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">{item.item.name}</p>
                                  <p className="text-sm text-gray-600">
                                    Quantity: {item.quantity} · {item.item.category}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Wishlist Items */}
                      {order.associatedWishlistItems && order.associatedWishlistItems.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Wishlist Items</h4>
                          <div className="space-y-2">
                            {order.associatedWishlistItems.map((wishlistItem, idx) => {
                              const isPending = wishlistItem.status === 'pending';
                              const isExpired = wishlistItem.status === 'expired';
                              let expiresAtDate: Date | null = null;
                              if (wishlistItem.expires_at) {
                                const parsed = parseISO(wishlistItem.expires_at);
                                if (isValid(parsed)) expiresAtDate = parsed;
                              }
                              const daysUntilExpiry = expiresAtDate
                                ? differenceInCalendarDays(expiresAtDate, new Date())
                                : null;
                              const isExpiringSoon =
                                isPending && daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 7;

                              return (
                                <div
                                  key={idx}
                                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                                    isExpired
                                      ? 'bg-gray-50 border-gray-200'
                                      : 'bg-orange-50 border-orange-200'
                                  }`}
                                >
                                  {wishlistItem.item.image_url && (
                                    <img
                                      src={wishlistItem.item.image_url}
                                      alt={wishlistItem.item.name}
                                      className="w-12 h-12 object-cover rounded"
                                    />
                                  )}
                                  <div className="flex-1">
                                    <p className={`font-medium ${isExpired ? 'text-gray-900' : 'text-orange-900'}`}>
                                      {wishlistItem.item.name}
                                    </p>
                                    <p className={`text-sm ${isExpired ? 'text-gray-600' : 'text-orange-700'}`}>
                                      Requested: {wishlistItem.quantity}
                                    </p>
                                    {isPending && expiresAtDate && (
                                      <p className="text-xs text-orange-700/80 mt-0.5">
                                        Expires: {format(expiresAtDate, 'MMM d, yyyy')}
                                      </p>
                                    )}
                                    {isExpired && (
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        This request expired. Submit a new request if you still need it.
                                      </p>
                                    )}
                                  </div>
                                  {isExpiringSoon && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 rounded-lg">
                                      <Hourglass className="h-3 w-3" />
                                      Expiring soon
                                    </span>
                                  )}
                                  {isExpired && (
                                    <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg">
                                      Expired
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            Questions about an order? Contact your admin team.
          </p>
        </div>
      </div>
    </div>
  );
}
