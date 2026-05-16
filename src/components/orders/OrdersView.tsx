import React, { useState, useMemo } from 'react';
import { Search, Filter, Trash2, RefreshCw, ChevronDown, AlertTriangle, Hourglass } from 'lucide-react';
import OrderCard, { OrderWithDetails } from './OrderCard';
import type { Order } from '../../types';

type StatusFilter = 'all' | Order['status'];

interface OrdersViewProps {
  orders: OrderWithDetails[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onStatusChange: (orderId: string, newStatus: Order['status']) => Promise<void>;
  onEditDates: (order: OrderWithDetails) => void;
  onDeleteSelected: (orderIds: string[]) => void;
  onFulfillWishlist: (
    wishlistRequestId: string,
    orderId: string,
    userEmail: string,
    userName: string,
    itemName: string,
    itemQuantity: number
  ) => void;
  onRetryNotification?: (orderId: string) => void | Promise<void>;
  retryingNotificationOrderIds?: Set<string>;
  processingOrders: Set<string>;
  getAvailableStatuses: (status: Order['status']) => Order['status'][];
}

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Orders' },
  { value: 'pending', label: 'Pending' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'returned', label: 'Returned' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'wishlist_only', label: 'Wishlist Only' }
];

export default function OrdersView({
  orders,
  loading,
  error,
  onRefresh,
  onStatusChange,
  onEditDates,
  onDeleteSelected,
  onFulfillWishlist,
  onRetryNotification,
  retryingNotificationOrderIds,
  processingOrders,
  getAvailableStatuses
}: OrdersViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  // Workstream C: filter chips for notification issues and expired wishlists.
  const [showNotificationIssuesOnly, setShowNotificationIssuesOnly] = useState(false);
  const [showExpiredWishlistsOnly, setShowExpiredWishlistsOnly] = useState(false);

  const notificationIssuesCount = useMemo(
    () =>
      orders.filter(
        (o) => o.notification_status === 'failed' || o.notification_status === 'retrying',
      ).length,
    [orders],
  );

  const expiredWishlistsCount = useMemo(
    () =>
      orders.filter((o) =>
        (o.associatedWishlistItems ?? []).some((w) => w.status === 'expired'),
      ).length,
    [orders],
  );

  // Filter orders based on search and status
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Status filter
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }

      // Notification-issues filter chip
      if (showNotificationIssuesOnly) {
        if (
          order.notification_status !== 'failed' &&
          order.notification_status !== 'retrying'
        ) {
          return false;
        }
      }

      // Expired-wishlist filter chip
      if (showExpiredWishlistsOnly) {
        const hasExpired = (order.associatedWishlistItems ?? []).some(
          (w) => w.status === 'expired',
        );
        if (!hasExpired) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = order.user_name.toLowerCase().includes(query);
        const matchesEmail = order.user_email.toLowerCase().includes(query);
        const matchesOrderNumber = (order.order_number || order.id).toLowerCase().includes(query);
        
        if (!matchesName && !matchesEmail && !matchesOrderNumber) {
          return false;
        }
      }

      return true;
    });
  }, [orders, searchQuery, statusFilter, showNotificationIssuesOnly, showExpiredWishlistsOnly]);

  // Group orders by status for better organization
  const groupedOrders = useMemo(() => {
    const active = filteredOrders.filter(o => o.status === 'pending' || o.status === 'picked_up');
    const wishlist = filteredOrders.filter(o => o.status === 'wishlist_only');
    const completed = filteredOrders.filter(o => o.status === 'returned' || o.status === 'cancelled');
    
    return { active, wishlist, completed };
  }, [filteredOrders]);

  const handleSelectOrder = (orderId: string, isSelected: boolean) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (isSelected) {
        next.add(orderId);
      } else {
        next.delete(orderId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedOrderIds.size === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedOrderIds.size} order(s)? This cannot be undone.`)) {
      onDeleteSelected(Array.from(selectedOrderIds));
      setSelectedOrderIds(new Set());
    }
  };

  const activeCount = orders.filter(o => o.status === 'pending' || o.status === 'picked_up').length;
  const wishlistCount = orders.filter(o => o.status === 'wishlist_only').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0075AE]"></div>
          <p className="text-gray-500">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <p className="text-sm text-amber-600">Active</p>
          <p className="text-2xl font-bold text-amber-700">{activeCount}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
          <p className="text-sm text-purple-600">Wishlist Only</p>
          <p className="text-2xl font-bold text-purple-700">{wishlistCount}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-sm text-green-600">Completed</p>
          <p className="text-2xl font-bold text-green-700">
            {orders.filter(o => o.status === 'returned').length}
          </p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or order number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors min-w-[160px]"
            >
              <Filter className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">
                {statusOptions.find(s => s.value === statusFilter)?.label}
              </span>
              <ChevronDown className="h-4 w-4 text-gray-400 ml-auto" />
            </button>
            
            {showStatusDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowStatusDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-20 py-1">
                  {statusOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setStatusFilter(option.value);
                        setShowStatusDropdown(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                        statusFilter === option.value ? 'bg-[#0075AE]/5 text-[#0075AE] font-medium' : 'text-gray-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Issue-focused filter chips */}
        {(notificationIssuesCount > 0 || expiredWishlistsCount > 0 || showNotificationIssuesOnly || showExpiredWishlistsOnly) && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => setShowNotificationIssuesOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                showNotificationIssuesOnly
                  ? 'bg-red-50 text-red-700 border-red-300'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
              title="Show only orders where the Power Automate webhook is failing or retrying"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Notification issues
              <span className={`px-1.5 rounded-full text-xs ${showNotificationIssuesOnly ? 'bg-red-200 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                {notificationIssuesCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowExpiredWishlistsOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                showExpiredWishlistsOnly
                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
              title="Show only orders that contain at least one expired wishlist request"
            >
              <Hourglass className="h-3.5 w-3.5" />
              Expired wishlists
              <span className={`px-1.5 rounded-full text-xs ${showExpiredWishlistsOnly ? 'bg-amber-200 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                {expiredWishlistsCount}
              </span>
            </button>
          </div>
        )}

        {/* Bulk Actions */}
        {filteredOrders.length > 0 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-[#0075AE] focus:ring-[#0075AE]"
              />
              Select all ({filteredOrders.length})
            </label>
            
            {selectedOrderIds.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors text-sm"
              >
                <Trash2 className="h-4 w-4" />
                Delete selected ({selectedOrderIds.size})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No orders found</h3>
          <p className="text-gray-500">
            {searchQuery || statusFilter !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'Orders will appear here once customers make requests'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Orders Section */}
          {groupedOrders.active.length > 0 && (statusFilter === 'all' || statusFilter === 'pending' || statusFilter === 'picked_up') && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
                Active Orders
                <span className="text-sm font-normal text-gray-500">({groupedOrders.active.length})</span>
              </h2>
              <div className="space-y-4">
                {groupedOrders.active.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderIds.has(order.id)}
                    isProcessing={processingOrders.has(order.id)}
                    onSelect={handleSelectOrder}
                    onStatusChange={onStatusChange}
                    onEditDates={onEditDates}
                    onFulfillWishlist={onFulfillWishlist}
                    availableStatuses={getAvailableStatuses(order.status)}
                    onRetryNotification={onRetryNotification}
                    isRetryingNotification={retryingNotificationOrderIds?.has(order.id) ?? false}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Wishlist Only Section */}
          {groupedOrders.wishlist.length > 0 && (statusFilter === 'all' || statusFilter === 'wishlist_only') && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                Wishlist Requests
                <span className="text-sm font-normal text-gray-500">({groupedOrders.wishlist.length})</span>
              </h2>
              <div className="space-y-4">
                {groupedOrders.wishlist.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderIds.has(order.id)}
                    isProcessing={processingOrders.has(order.id)}
                    onSelect={handleSelectOrder}
                    onStatusChange={onStatusChange}
                    onEditDates={onEditDates}
                    onFulfillWishlist={onFulfillWishlist}
                    availableStatuses={getAvailableStatuses(order.status)}
                    onRetryNotification={onRetryNotification}
                    isRetryingNotification={retryingNotificationOrderIds?.has(order.id) ?? false}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Orders Section */}
          {groupedOrders.completed.length > 0 && (statusFilter === 'all' || statusFilter === 'returned' || statusFilter === 'cancelled') && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                Completed / Cancelled
                <span className="text-sm font-normal text-gray-500">({groupedOrders.completed.length})</span>
              </h2>
              <div className="space-y-4">
                {groupedOrders.completed.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderIds.has(order.id)}
                    isProcessing={processingOrders.has(order.id)}
                    onSelect={handleSelectOrder}
                    onStatusChange={onStatusChange}
                    onEditDates={onEditDates}
                    onFulfillWishlist={onFulfillWishlist}
                    availableStatuses={getAvailableStatuses(order.status)}
                    onRetryNotification={onRetryNotification}
                    isRetryingNotification={retryingNotificationOrderIds?.has(order.id) ?? false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
