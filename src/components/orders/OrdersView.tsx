import React, { useState, useMemo } from 'react';
import { Search, Trash2, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import OrderCard, { OrderWithDetails } from './OrderCard';
import type { Order } from '../../types';

type StatusFilter = '' | Order['status'];

interface OrdersViewProps {
  orders: OrderWithDetails[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  statusFilter: string;
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
    itemQuantity: number,
  ) => void;
  onRejectOrder: (orderId: string, reason: string) => Promise<void>;
  onProcessReturn: (
    orderId: string,
    lines: { checkoutId: string; returnedQty: number; damagedQty: number; notes: string }[],
  ) => Promise<void>;
  onPageChange: (page: number) => void;
  onStatusFilterChange: (filter: string) => void;
  processingOrders: Set<string>;
  getAvailableStatuses: (status: Order['status']) => Order['status'][];
}

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: '',             label: 'All Orders' },
  { value: 'pending',      label: 'Pending' },
  { value: 'picked_up',    label: 'Picked Up' },
  { value: 'returned',     label: 'Returned' },
  { value: 'cancelled',    label: 'Cancelled' },
  { value: 'rejected',     label: 'Rejected' },
  { value: 'wishlist_only', label: 'Wishlist Only' },
];

export default function OrdersView({
  orders,
  loading,
  error,
  totalCount,
  currentPage,
  pageSize,
  statusFilter,
  onRefresh,
  onStatusChange,
  onEditDates,
  onDeleteSelected,
  onFulfillWishlist,
  onRejectOrder,
  onProcessReturn,
  onPageChange,
  onStatusFilterChange,
  processingOrders,
  getAvailableStatuses,
}: OrdersViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Client-side search filter on top of server-paginated results
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const query = searchQuery.toLowerCase();
    return orders.filter((order) => {
      const matchesName   = order.user_name.toLowerCase().includes(query);
      const matchesEmail  = order.user_email.toLowerCase().includes(query);
      const matchesNumber = (order.order_number || order.id).toLowerCase().includes(query);
      return matchesName || matchesEmail || matchesNumber;
    });
  }, [orders, searchQuery]);

  // Group for display
  const groupedOrders = useMemo(() => {
    const active    = filteredOrders.filter((o) => o.status === 'pending' || o.status === 'picked_up');
    const wishlist  = filteredOrders.filter((o) => o.status === 'wishlist_only');
    const completed = filteredOrders.filter((o) => o.status === 'returned' || o.status === 'cancelled');
    const rejected  = filteredOrders.filter((o) => o.status === 'rejected');
    return { active, wishlist, completed, rejected };
  }, [filteredOrders]);

  const handleSelectOrder = (orderId: string, isSelected: boolean) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(orderId); else next.delete(orderId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedOrderIds.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedOrderIds.size} order(s)? This cannot be undone.`)) {
      onDeleteSelected(Array.from(selectedOrderIds));
      setSelectedOrderIds(new Set());
    }
  };

  const activeCount   = orders.filter((o) => o.status === 'pending' || o.status === 'picked_up').length;
  const wishlistCount = orders.filter((o) => o.status === 'wishlist_only').length;
  const rejectedCount = orders.filter((o) => o.status === 'rejected').length;

  const currentFilterLabel = statusOptions.find((s) => s.value === statusFilter)?.label ?? 'All Orders';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0075AE]" />
          <p className="text-gray-500">Loading orders…</p>
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
          <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
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
            {orders.filter((o) => o.status === 'returned').length}
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
              placeholder="Search by name, email, or order number…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* Status Filter (server-side) */}
          <div className="relative">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors min-w-[160px]"
            >
              <Filter className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">{currentFilterLabel}</span>
              <ChevronDown className="h-4 w-4 text-gray-400 ml-auto" />
            </button>

            {showStatusDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowStatusDropdown(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-20 py-1">
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        onStatusFilterChange(option.value);
                        setShowStatusDropdown(false);
                        setSearchQuery('');
                        setSelectedOrderIds(new Set());
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                        statusFilter === option.value
                          ? 'bg-[#0075AE]/5 text-[#0075AE] font-medium'
                          : 'text-gray-700'
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

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>
      )}

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No orders found</h3>
          <p className="text-gray-500">
            {searchQuery || statusFilter
              ? 'Try adjusting your search or filters'
              : 'Orders will appear here once customers make requests'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Orders */}
          {groupedOrders.active.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-400 rounded-full" />
                Active Orders
                <span className="text-sm font-normal text-gray-500">({groupedOrders.active.length})</span>
              </h2>
              <div className="space-y-4">
                {groupedOrders.active.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderIds.has(order.id)}
                    isProcessing={processingOrders.has(order.id)}
                    onSelect={handleSelectOrder}
                    onStatusChange={onStatusChange}
                    onEditDates={onEditDates}
                    onFulfillWishlist={onFulfillWishlist}
                    onRejectOrder={onRejectOrder}
                    onProcessReturn={onProcessReturn}
                    availableStatuses={getAvailableStatuses(order.status)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Wishlist Only */}
          {groupedOrders.wishlist.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full" />
                Wishlist Requests
                <span className="text-sm font-normal text-gray-500">({groupedOrders.wishlist.length})</span>
              </h2>
              <div className="space-y-4">
                {groupedOrders.wishlist.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderIds.has(order.id)}
                    isProcessing={processingOrders.has(order.id)}
                    onSelect={handleSelectOrder}
                    onStatusChange={onStatusChange}
                    onEditDates={onEditDates}
                    onFulfillWishlist={onFulfillWishlist}
                    onRejectOrder={onRejectOrder}
                    onProcessReturn={onProcessReturn}
                    availableStatuses={getAvailableStatuses(order.status)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed / Cancelled */}
          {groupedOrders.completed.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                Completed / Cancelled
                <span className="text-sm font-normal text-gray-500">({groupedOrders.completed.length})</span>
              </h2>
              <div className="space-y-4">
                {groupedOrders.completed.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderIds.has(order.id)}
                    isProcessing={processingOrders.has(order.id)}
                    onSelect={handleSelectOrder}
                    onStatusChange={onStatusChange}
                    onEditDates={onEditDates}
                    onFulfillWishlist={onFulfillWishlist}
                    onRejectOrder={onRejectOrder}
                    onProcessReturn={onProcessReturn}
                    availableStatuses={getAvailableStatuses(order.status)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Rejected */}
          {groupedOrders.rejected.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-rose-400 rounded-full" />
                Rejected
                <span className="text-sm font-normal text-gray-500">({rejectedCount})</span>
              </h2>
              <div className="space-y-4">
                {groupedOrders.rejected.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isSelected={selectedOrderIds.has(order.id)}
                    isProcessing={processingOrders.has(order.id)}
                    onSelect={handleSelectOrder}
                    onStatusChange={onStatusChange}
                    onEditDates={onEditDates}
                    onFulfillWishlist={onFulfillWishlist}
                    onRejectOrder={onRejectOrder}
                    onProcessReturn={onProcessReturn}
                    availableStatuses={getAvailableStatuses(order.status)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Page {currentPage} of {totalPages} · {totalCount} total order{totalCount !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>

            {/* Page number buttons (show up to 5 around current) */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (p) =>
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - currentPage) <= 2,
              )
              .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-gray-400 text-sm">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => onPageChange(p as number)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === p
                        ? 'bg-[#0075AE] text-white'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
