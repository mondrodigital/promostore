import React, { useState } from 'react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
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
  Edit,
  AlertTriangle,
  Ban,
  Hourglass,
} from 'lucide-react';
import type { Order } from '../../types';
import StatusDropdown from '../StatusDropdown';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

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
  requested_pickup_date?: string | null;
  requested_return_date?: string | null;
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
  actual_pickup_date: string | null;
  actual_return_date: string | null;
  rejection_reason: string | null;
  status: 'pending' | 'picked_up' | 'returned' | 'cancelled' | 'wishlist_only' | 'rejected';
  items: CheckoutItem[];
  associatedWishlistItems: WishlistItem[];
}

// Partial return state per checkout line
interface ReturnLine {
  checkoutId: string;
  itemName: string;
  orderedQty: number;
  returnedQty: number;
  damagedQty: number;
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
    itemQuantity: number,
  ) => void;
  onRejectOrder: (orderId: string, reason: string) => Promise<void>;
  onProcessReturn: (
    orderId: string,
    lines: { checkoutId: string; returnedQty: number; damagedQty: number; notes: string }[],
  ) => Promise<void>;
  availableStatuses: Order['status'][];
}

// ----------------------------------------------------------------
// Status config (includes 'rejected')
// ----------------------------------------------------------------

const statusConfig: Record<
  OrderWithDetails['status'],
  { label: string; icon: React.ElementType; bgColor: string; textColor: string; borderColor: string; iconColor: string }
> = {
  pending: {
    label: 'Pending Pickup',
    icon: Clock,
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    iconColor: 'text-amber-500',
  },
  picked_up: {
    label: 'Picked Up',
    icon: Truck,
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-500',
  },
  returned: {
    label: 'Returned',
    icon: CheckCircle,
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
    iconColor: 'text-green-500',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    iconColor: 'text-red-500',
  },
  wishlist_only: {
    label: 'Wishlist Only',
    icon: Star,
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    iconColor: 'text-purple-500',
  },
  rejected: {
    label: 'Rejected',
    icon: Ban,
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-700',
    borderColor: 'border-rose-200',
    iconColor: 'text-rose-500',
  },
};

// ----------------------------------------------------------------
// RejectDialog — inline modal asking for a rejection reason
// ----------------------------------------------------------------

function RejectDialog({
  onConfirm,
  onCancel,
  isProcessing,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
            <Ban className="h-5 w-5 text-rose-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Reject Order</h3>
            <p className="text-sm text-gray-500">Provide a reason that will be emailed to the customer.</p>
          </div>
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Items unavailable for the requested dates…"
          rows={3}
          className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-rose-400 focus:border-transparent outline-none resize-none"
        />

        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={isProcessing || !reason.trim()}
            className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {isProcessing ? 'Rejecting…' : 'Reject Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// ProcessReturnModal — per-line-item partial return form
// ----------------------------------------------------------------

function ProcessReturnModal({
  lines,
  onLinesChange,
  notes,
  onNotesChange,
  onConfirm,
  onCancel,
  isProcessing,
}: {
  lines: ReturnLine[];
  onLinesChange: (lines: ReturnLine[]) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}) {
  const updateLine = (idx: number, field: 'returnedQty' | 'damagedQty', value: number) => {
    const updated = lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, [field]: value };
      // keep damaged ≤ returned
      if (next.damagedQty > next.returnedQty) next.damagedQty = next.returnedQty;
      return next;
    });
    onLinesChange(updated);
  };

  const hasAnyReturn = lines.some((l) => l.returnedQty > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <RotateCcw className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Process Partial Return</h3>
            <p className="text-sm text-gray-500">
              Specify how many items were returned and how many are damaged (damaged items are not
              restocked).
            </p>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          {lines.map((line, idx) => (
            <div
              key={line.checkoutId}
              className="p-4 border border-gray-100 rounded-lg bg-gray-50"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-gray-900 text-sm">{line.itemName}</p>
                <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border">
                  Checked out: {line.orderedQty}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Returned qty
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={line.orderedQty}
                    value={line.returnedQty}
                    onChange={(e) => updateLine(idx, 'returnedQty', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Damaged qty
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={line.returnedQty}
                    value={line.damagedQty}
                    onChange={(e) => updateLine(idx, 'damagedQty', Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {line.returnedQty > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Restocking:{' '}
                  <span className="text-green-600 font-medium">
                    {line.returnedQty - line.damagedQty} undamaged
                  </span>
                  {line.damagedQty > 0 && (
                    <span className="text-amber-600 font-medium">
                      {' '}· {line.damagedQty} damaged (not restocked)
                    </span>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="e.g. Item 2 had a tear, item 3 returned early…"
            rows={2}
            className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing || !hasAnyReturn}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {isProcessing ? 'Processing…' : 'Submit Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// OrderCard
// ----------------------------------------------------------------

export default function OrderCard({
  order,
  isSelected,
  isProcessing,
  onSelect,
  onStatusChange,
  onEditDates,
  onFulfillWishlist,
  onRejectOrder,
  onProcessReturn,
  availableStatuses,
}: OrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [returnNotes, setReturnNotes] = useState('');

  const config = statusConfig[order.status];
  const StatusIcon = config.icon;

  const hasCheckoutItems = order.items && order.items.length > 0;
  const hasWishlistItems = order.associatedWishlistItems && order.associatedWishlistItems.length > 0;
  const totalItems = (order.items?.length || 0) + (order.associatedWishlistItems?.length || 0);

  const previewImages = [
    ...order.items.slice(0, 3).map((i) => i.item?.image_url).filter(Boolean),
    ...order.associatedWishlistItems.slice(0, 3).map((i) => i.item?.image_url).filter(Boolean),
  ].slice(0, 4) as string[];

  // ---- Reject handler ----
  const handleReject = async (reason: string) => {
    await onRejectOrder(order.id, reason);
    setShowRejectDialog(false);
  };

  // ---- Process return: open modal pre-filled with order lines ----
  const openReturnModal = () => {
    setReturnLines(
      order.items.map((c) => ({
        checkoutId: c.id,
        itemName: c.item?.name || 'Unknown Item',
        orderedQty: c.quantity,
        returnedQty: 0,
        damagedQty: 0,
      })),
    );
    setReturnNotes('');
    setShowReturnModal(true);
  };

  const handleProcessReturn = async () => {
    const payload = returnLines
      .filter((l) => l.returnedQty > 0)
      .map((l) => ({
        checkoutId: l.checkoutId,
        returnedQty: l.returnedQty,
        damagedQty: l.damagedQty,
        notes: returnNotes,
      }));
    await onProcessReturn(order.id, payload);
    setShowReturnModal(false);
  };

  // ---- Confirm pickup / confirm return: reuse onStatusChange ----
  const handleConfirmPickup = () => onStatusChange(order.id, 'picked_up');
  const handleConfirmReturn  = () => onStatusChange(order.id, 'returned');

  return (
    <>
      {showRejectDialog && (
        <RejectDialog
          onConfirm={handleReject}
          onCancel={() => setShowRejectDialog(false)}
          isProcessing={isProcessing}
        />
      )}

      {showReturnModal && (
        <ProcessReturnModal
          lines={returnLines}
          onLinesChange={setReturnLines}
          notes={returnNotes}
          onNotesChange={setReturnNotes}
          onConfirm={handleProcessReturn}
          onCancel={() => setShowReturnModal(false)}
          isProcessing={isProcessing}
        />
      )}

      <div
        className={`bg-white rounded-xl border-2 transition-all duration-200 ${
          isSelected ? 'border-[#0075AE] shadow-lg' : 'border-gray-100 hover:border-gray-200 shadow-sm'
        }`}
      >
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
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${config.bgColor} ${config.textColor} border ${config.borderColor}`}
                  >
                    <StatusIcon className={`h-4 w-4 ${config.iconColor}`} />
                    <span className="text-sm font-medium">{config.label}</span>
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* Edit dates (pending / picked_up only) */}
                  {(order.status === 'pending' || order.status === 'picked_up') && (
                    <button
                      onClick={() => onEditDates(order)}
                      className="p-2 text-gray-400 hover:text-[#0075AE] hover:bg-gray-50 rounded-lg transition-colors"
                      title="Edit dates"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  )}

                  {/* Reject button (pending only) */}
                  {order.status === 'pending' && (
                    <button
                      onClick={() => setShowRejectDialog(true)}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50 transition-colors"
                      title="Reject this order"
                    >
                      <Ban className="h-4 w-4" />
                      Reject
                    </button>
                  )}

                  {/* Confirm Pickup (pending only) */}
                  {order.status === 'pending' && (
                    <button
                      onClick={handleConfirmPickup}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#0075AE] rounded-lg hover:bg-[#005f8c] disabled:opacity-50 transition-colors"
                    >
                      <Truck className="h-4 w-4" />
                      Confirm Pickup
                    </button>
                  )}

                  {/* Confirm Return (picked_up only) */}
                  {order.status === 'picked_up' && (
                    <button
                      onClick={handleConfirmReturn}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Confirm Return
                    </button>
                  )}

                  {/* Process Return (picked_up with checkout items) */}
                  {order.status === 'picked_up' && hasCheckoutItems && (
                    <button
                      onClick={openReturnModal}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Process Return
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

              {/* Rejection reason banner */}
              {order.status === 'rejected' && order.rejection_reason && (
                <div className="flex items-start gap-2 px-3 py-2 mb-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Rejection reason:</strong> {order.rejection_reason}
                  </span>
                </div>
              )}

              {/* Dates Row */}
              <div className="flex flex-wrap items-center gap-4 text-sm mb-4">
                {order.checkout_date && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">
                      Pickup:{' '}
                      <span className="font-medium text-gray-900">
                        {format(parseISO(order.checkout_date), 'MMM d, yyyy')}
                      </span>
                    </span>
                  </div>
                )}
                {order.return_date && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg">
                    <RotateCcw className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">
                      Return:{' '}
                      <span className="font-medium text-gray-900">
                        {format(parseISO(order.return_date), 'MMM d, yyyy')}
                      </span>
                    </span>
                  </div>
                )}
                {order.actual_pickup_date && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 rounded-lg">
                    <Truck className="h-4 w-4 text-blue-400" />
                    <span className="text-gray-600">
                      Picked up:{' '}
                      <span className="font-medium text-blue-700">
                        {format(new Date(order.actual_pickup_date), 'MMM d, yyyy')}
                      </span>
                    </span>
                  </div>
                )}
                {order.actual_return_date && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 rounded-lg">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-gray-600">
                      Returned:{' '}
                      <span className="font-medium text-green-700">
                        {format(new Date(order.actual_return_date), 'MMM d, yyyy')}
                      </span>
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

                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span>{isExpanded ? 'Hide' : 'View'} details</span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
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
                        <p className="font-medium text-gray-900">
                          {checkout.item?.name || 'Unknown Item'}
                        </p>
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
                    const isPending = wishlistItem.status === 'pending';
                    const isExpired = wishlistItem.status === 'expired';
                    const available = wishlistItem.item?.available_quantity || 0;
                    const hasStock = available >= wishlistItem.quantity;

                    const statusLabel = !isPending
                      ? wishlistItem.status === 'added_to_order'
                        ? 'Added to Order'
                        : wishlistItem.status === 'expired'
                          ? 'Expired'
                          : wishlistItem.status.replace(/_/g, ' ')
                      : null;

                    const pickupDateStr = wishlistItem.requested_pickup_date
                      ? format(parseISO(wishlistItem.requested_pickup_date), 'MMM d, yyyy')
                      : null;

                    let daysUntilExpiry: number | null = null;
                    let expiryDateStr: string | null = null;
                    if (wishlistItem.expires_at) {
                      try {
                        const expiresAt = parseISO(wishlistItem.expires_at);
                        daysUntilExpiry = differenceInCalendarDays(expiresAt, new Date());
                        expiryDateStr = format(expiresAt, 'MMM d, yyyy');
                      } catch {
                        // ignore parse errors
                      }
                    }
                    const isExpiringSoon =
                      isPending && daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 7;

                    return (
                      <div
                        key={wishlistItem.wishlist_request_id}
                        className={`flex items-center gap-3 p-3 bg-white rounded-lg border ${
                          isExpired
                            ? 'border-gray-200 bg-gray-50/60'
                            : !isPending
                              ? 'border-green-200 bg-green-50/30'
                              : 'border-orange-100'
                        }`}
                      >
                        <img
                          src={wishlistItem.item?.image_url || 'https://placehold.co/48x48/png'}
                          alt={wishlistItem.item?.name || 'Item'}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {wishlistItem.item?.name || 'Unknown Item'}
                          </p>
                          <p className="text-sm text-gray-500">
                            Requested: {wishlistItem.quantity} · Available now: {available}
                          </p>
                          {isPending && pickupDateStr && (
                            <p className="text-xs text-gray-400 mt-0.5">Needs by: {pickupDateStr}</p>
                          )}
                        </div>
                        {statusLabel && (
                          <span
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
                              isExpired ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {statusLabel}
                          </span>
                        )}
                        {isPending && wishlistItem.item && (
                          <button
                            onClick={() =>
                              onFulfillWishlist(
                                wishlistItem.wishlist_request_id,
                                order.id,
                                order.user_email,
                                order.user_name,
                                wishlistItem.item?.name || 'Unknown Item',
                                wishlistItem.quantity,
                              )
                            }
                            disabled={isProcessing}
                            className={`px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors ${
                              hasStock
                                ? 'bg-[#0075AE] hover:bg-[#005f8c]'
                                : 'bg-amber-500 hover:bg-amber-600'
                            }`}
                            title={
                              hasStock
                                ? 'Fulfill now — inventory available'
                                : 'Fulfill — inventory not yet available, will be reserved'
                            }
                          >
                            {isProcessing ? 'Processing…' : 'Fulfill'}
                          </button>
                        )}
                        {isPending && expiryDateStr && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Expires: {expiryDateStr}
                          </p>
                        )}
                        {isExpiringSoon && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium rounded-lg"
                            title={`Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`}
                          >
                            <Hourglass className="h-3 w-3" />
                            Expiring soon
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!hasCheckoutItems && !hasWishlistItems && (
              <p className="text-sm text-gray-500 italic text-center py-4">
                No items in this order
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
