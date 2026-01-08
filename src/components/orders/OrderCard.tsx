import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  User, 
  Mail, 
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  RotateCcw,
  Star,
  Edit
} from 'lucide-react';
import type { Order } from '../../types';
import StatusDropdown from '../StatusDropdown';

// Types for the order data from edge function
interface CheckoutItem {
  id: string;
  item: {
    id: string;
    name: string;
    image_url: string | null;
    description?: string;
    available_quantity?: number;
  } | null;
  quantity: number;
}

interface WishlistItem {
  wishlist_request_id: string;
  item: {
    id: string;
    name: string;
    image_url: string | null;
    description?: string;
    available_quantity?: number;
  } | null;
  quantity: number;
  status: string;
  isWishlistItem: boolean;
}

export interface OrderWithDetails {
  id: string;
  order_number?: string;
  created_at: string;
  user_name: string;
  user_email: string;
  checkout_date: string | null;
  return_date: string | null;
  status: 'pending' | 'picked_up' | 'returned' | 'cancelled' | 'wishlist_only';
  items: CheckoutItem[];
  associatedWishlistItems: WishlistItem[];
}

interface OrderCardProps {
  order: OrderWithDetails;
  isSelected: boolean;
  isProcessing: boolean;
  onSelect: (orderId: string, isSelected: boolean) => void;
  onStatusChange: (orderId: string, newStatus: Order['status']) => Promise<void>;
  onEditDates: (order: OrderWithDetails) => void;
  onFulfillWishlist: (
    wishlistRequestId: string,
    orderId: string,
    userEmail: string,
    userName: string,
    itemName: string,
    itemQuantity: number
  ) => void;
  availableStatuses: Order['status'][];
}

const statusConfig = {
  pending: {
    label: 'Pending Pickup',
    icon: Clock,
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    iconColor: 'text-amber-500'
  },
  picked_up: {
    label: 'Picked Up',
    icon: Truck,
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-500'
  },
  returned: {
    label: 'Returned',
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    iconColor: 'text-green-500'
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    iconColor: 'text-red-500'
  },
  wishlist_only: {
    label: 'Wishlist Only',
    icon: Star,
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    iconColor: 'text-purple-500'
  }
};

export default function OrderCard({
  order,
  isSelected,
  isProcessing,
  onSelect,
  onStatusChange,
  onEditDates,
  onFulfillWishlist,
  availableStatuses
}: OrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const config = statusConfig[order.status];
  const StatusIcon = config.icon;
  
  const hasCheckoutItems = order.items && order.items.length > 0;
  const hasWishlistItems = order.associatedWishlistItems && order.associatedWishlistItems.length > 0;
  const totalItems = (order.items?.length || 0) + (order.associatedWishlistItems?.length || 0);

  // Get first few item images for preview
  const previewImages = [
    ...order.items.slice(0, 3).map(i => i.item?.image_url).filter(Boolean),
    ...order.associatedWishlistItems.slice(0, 3).map(i => i.item?.image_url).filter(Boolean)
  ].slice(0, 4);

  return (
    <div className={`bg-white rounded-xl border-2 transition-all duration-200 ${
      isSelected ? 'border-[#0075AE] shadow-lg' : 'border-gray-100 hover:border-gray-200 shadow-sm'
    }`}>
      {/* Card Header */}
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Checkbox */}
          <div className="pt-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelect(order.id, e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-[#0075AE] focus:ring-[#0075AE] cursor-pointer"
            />
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Top Row: Order Number + Status */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-gray-900">
                  {order.order_number || `#${order.id.slice(0, 8)}`}
                </h3>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${config.bgColor} ${config.textColor} border ${config.borderColor}`}>
                  <StatusIcon className={`h-4 w-4 ${config.iconColor}`} />
                  <span className="text-sm font-medium">{config.label}</span>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-2">
                {(order.status === 'pending' || order.status === 'picked_up') && (
                  <button
                    onClick={() => onEditDates(order)}
                    className="p-2 text-gray-400 hover:text-[#0075AE] hover:bg-gray-50 rounded-lg transition-colors"
                    title="Edit dates"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                )}
                <StatusDropdown
                  status={order.status}
                  orderId={order.id}
                  onStatusChange={onStatusChange}
                  disabled={isProcessing}
                  availableStatuses={availableStatuses}
                />
              </div>
            </div>

            {/* Customer Info */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-gray-900">{order.user_name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-gray-400" />
                <span>{order.user_email}</span>
              </div>
            </div>

            {/* Dates Row */}
            <div className="flex flex-wrap items-center gap-4 text-sm mb-4">
              {order.checkout_date && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">
                    Pickup: <span className="font-medium text-gray-900">{format(parseISO(order.checkout_date), 'MMM d, yyyy')}</span>
                  </span>
                </div>
              )}
              {order.return_date && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg">
                  <RotateCcw className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">
                    Return: <span className="font-medium text-gray-900">{format(parseISO(order.return_date), 'MMM d, yyyy')}</span>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock className="h-4 w-4" />
                <span>Created {format(new Date(order.created_at), 'MMM d, yyyy')}</span>
              </div>
            </div>

            {/* Items Preview */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Item thumbnails */}
                <div className="flex -space-x-2">
                  {previewImages.map((url, idx) => (
                    <img
                      key={idx}
                      src={url || 'https://placehold.co/40x40/png'}
                      alt=""
                      className="w-10 h-10 rounded-lg border-2 border-white object-cover"
                    />
                  ))}
                  {totalItems > 4 && (
                    <div className="w-10 h-10 rounded-lg border-2 border-white bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                      +{totalItems - 4}
                    </div>
                  )}
                </div>
                
                {/* Item count summary */}
                <div className="flex items-center gap-2">
                  {hasCheckoutItems && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs font-medium">
                      <Package className="h-3 w-3" />
                      {order.items.length} checkout
                    </span>
                  )}
                  {hasWishlistItems && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs font-medium">
                      <Star className="h-3 w-3" />
                      {order.associatedWishlistItems.length} wishlist
                    </span>
                  )}
                </div>
              </div>

              {/* Expand/Collapse */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <span>{isExpanded ? 'Hide' : 'View'} details</span>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/50">
          {/* Checkout Items */}
          {hasCheckoutItems && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Package className="h-4 w-4 text-green-600" />
                Checked Out Items
              </h4>
              <div className="grid gap-2">
                {order.items.map((checkout) => (
                  <div
                    key={checkout.id}
                    className="flex items-center gap-3 p-3 bg-white rounded-lg border border-green-100"
                  >
                    <img
                      src={checkout.item?.image_url || 'https://placehold.co/48x48/png'}
                      alt={checkout.item?.name || 'Item'}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{checkout.item?.name || 'Unknown Item'}</p>
                      <p className="text-sm text-gray-500">Quantity: {checkout.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Wishlist Items */}
          {hasWishlistItems && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Star className="h-4 w-4 text-orange-500" />
                Wishlist Items
              </h4>
              <div className="grid gap-2">
                {order.associatedWishlistItems.map((wishlistItem) => {
                  const canFulfill = wishlistItem.item && 
                    (wishlistItem.item.available_quantity || 0) >= wishlistItem.quantity &&
                    wishlistItem.quantity > 0;

                  return (
                    <div
                      key={wishlistItem.wishlist_request_id}
                      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-orange-100"
                    >
                      <img
                        src={wishlistItem.item?.image_url || 'https://placehold.co/48x48/png'}
                        alt={wishlistItem.item?.name || 'Item'}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{wishlistItem.item?.name || 'Unknown Item'}</p>
                        <p className="text-sm text-gray-500">
                          Requested: {wishlistItem.quantity} • Available: {wishlistItem.item?.available_quantity || 0}
                        </p>
                      </div>
                      {canFulfill && (
                        <button
                          onClick={() => onFulfillWishlist(
                            wishlistItem.wishlist_request_id,
                            order.id,
                            order.user_email,
                            order.user_name,
                            wishlistItem.item?.name || 'Unknown Item',
                            wishlistItem.quantity
                          )}
                          disabled={isProcessing}
                          className="px-3 py-1.5 bg-[#0075AE] text-white text-sm font-medium rounded-lg hover:bg-[#005f8c] disabled:opacity-50 transition-colors"
                        >
                          {isProcessing ? 'Processing...' : 'Fulfill'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!hasCheckoutItems && !hasWishlistItems && (
            <p className="text-sm text-gray-500 italic text-center py-4">No items in this order</p>
          )}
        </div>
      )}
    </div>
  );
}
