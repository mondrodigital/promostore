import React, { useState } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import type { Order } from '../../types';

interface EditingOrderDates {
  orderId: string;
  currentPickupDate: Date | null;
  currentReturnDate: Date | null;
  status: Order['status'];
}

interface EditDatesModalProps {
  orderDates: EditingOrderDates;
  onClose: () => void;
  onSave: (pickupDate: string, returnDate: string) => Promise<void>;
  saving: boolean;
}

export default function EditDatesModal({
  orderDates,
  onClose,
  onSave,
  saving
}: EditDatesModalProps) {
  const [newPickupDate, setNewPickupDate] = useState(
    orderDates.currentPickupDate ? format(orderDates.currentPickupDate, 'yyyy-MM-dd') : ''
  );
  const [newReturnDate, setNewReturnDate] = useState(
    orderDates.currentReturnDate ? format(orderDates.currentReturnDate, 'yyyy-MM-dd') : ''
  );
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    // Validation
    if (!newReturnDate) {
      setError('Return date is required.');
      return;
    }

    if (orderDates.status === 'pending' && !newPickupDate) {
      setError('Pickup date is required for pending orders.');
      return;
    }

    if (newPickupDate && newReturnDate && new Date(newReturnDate) < new Date(newPickupDate)) {
      setError('Return date cannot be before pickup date.');
      return;
    }

    await onSave(newPickupDate, newReturnDate);
  };

  const canEditPickup = orderDates.status === 'pending';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md relative">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Edit Order Dates</h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Order ID: <span className="font-mono">{orderDates.orderId.slice(0, 8)}...</span>
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          {/* Pickup Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pickup Date
            </label>
            <input
              type="date"
              value={newPickupDate}
              onChange={(e) => setNewPickupDate(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              disabled={!canEditPickup}
              className={`w-full px-3 py-2 border rounded-lg outline-none transition-colors ${
                canEditPickup
                  ? 'border-gray-300 focus:ring-2 focus:ring-[#0075AE] focus:border-transparent'
                  : 'border-gray-200 bg-gray-100 cursor-not-allowed'
              }`}
            />
            <div className="mt-1 flex justify-between">
              <span className="text-xs text-gray-500">
                Current: {orderDates.currentPickupDate ? format(orderDates.currentPickupDate, 'MMM d, yyyy') : 'N/A'}
              </span>
              {!canEditPickup && (
                <span className="text-xs text-amber-600">Cannot edit after pickup</span>
              )}
            </div>
          </div>

          {/* Return Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Return Date
            </label>
            <input
              type="date"
              value={newReturnDate}
              onChange={(e) => setNewReturnDate(e.target.value)}
              min={newPickupDate || format(new Date(), 'yyyy-MM-dd')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Current: {orderDates.currentReturnDate ? format(orderDates.currentReturnDate, 'MMM d, yyyy') : 'N/A'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#0075AE] text-white rounded-lg text-sm font-medium hover:bg-[#005f8c] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
