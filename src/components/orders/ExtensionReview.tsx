import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { parseDateOnly } from '../../lib/dates';
import { ADMIN_NOTE_MAX } from '../../lib/itemLimits';

interface ExtensionOrder {
  id: string;
  order_number?: string;
  user_name: string;
  user_email: string;
  return_date: string | null;
  extension_requested_return_date?: string | null;
}

interface ExtensionReviewProps {
  order: ExtensionOrder;
  disabled: boolean;
  onReview: (orderId: string, approve: boolean, note: string) => Promise<void>;
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const parsed = parseDateOnly(value);
  return parsed ? format(parsed, 'MMM d, yyyy') : value;
}

export default function ExtensionReview({ order, disabled, onReview }: ExtensionReviewProps) {
  const [note, setNote] = useState('');
  const [pendingAction, setPendingAction] = useState<'approve' | 'deny' | null>(null);
  const lockRef = useRef(false);

  async function review(approve: boolean) {
    if (lockRef.current || disabled) return;
    lockRef.current = true;
    setPendingAction(approve ? 'approve' : 'deny');
    try {
      await onReview(order.id, approve, note.trim());
      setNote('');
    } finally {
      lockRef.current = false;
      setPendingAction(null);
    }
  }

  const busy = disabled || pendingAction !== null;
  const label = order.order_number || `Order ${order.id.slice(0, 8)}`;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Pending extension</p>
      <p className="mt-1 text-sm text-amber-900">{label}</p>
      <p className="mt-1 text-sm text-amber-800">
        {order.user_name} · {order.user_email}
      </p>
      <p className="mt-2 text-sm text-amber-900">
        Current return: {formatDateOnly(order.return_date)}
      </p>
      <p className="text-sm text-amber-900">
        Requested return: {formatDateOnly(order.extension_requested_return_date)}
      </p>
      <label className="mt-3 block text-xs font-medium text-amber-900" htmlFor={`extension-note-${order.id}`}>
        Note to the requester (optional)
      </label>
      <textarea
        id={`extension-note-${order.id}`}
        value={note}
        maxLength={ADMIN_NOTE_MAX}
        rows={2}
        onChange={(event) => setNote(event.target.value.slice(0, ADMIN_NOTE_MAX))}
        className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#0075AE]"
        placeholder="Shown to the requester if you deny the request"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => review(true)}
          className="rounded-lg bg-[#0075AE] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#005f8c] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === 'approve' ? 'Approving...' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => review(false)}
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === 'deny' ? 'Denying...' : 'Deny'}
        </button>
      </div>
    </div>
  );
}
