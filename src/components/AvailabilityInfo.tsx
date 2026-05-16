import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchItemConflicts, type ItemConflictRange } from '../services/orderService';

interface AvailabilityInfoProps {
  itemId: string;
  startDate: Date;
  endDate: Date;
  /**
   * Optional label override. Defaults to "Why?" when partially available or
   * "View conflicts" when there are any active reservations.
   */
  label?: string;
}

/**
 * Small info button + popover that, on click, fetches the date-range conflicts
 * for an item via `get_item_conflicts` and displays them. Privacy-safe — the
 * server function returns ONLY date ranges and aggregated quantities, never
 * other LOs' names, emails, or order ids.
 *
 * Used to back issue #18 (why is this unavailable / partially unavailable) and
 * issue #9 (cart-time "heads up: N also reserved for X").
 */
export default function AvailabilityInfo({ itemId, startDate, endDate, label }: AvailabilityInfoProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ItemConflictRange[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchItemConflicts(itemId, startDate, endDate)
      .then(rows => {
        if (!cancelled) setConflicts(rows);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || 'Failed to load conflict info');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, itemId, startDate, endDate]);

  const totalCommitted = conflicts.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 hover:underline"
        title="Why is this unavailable?"
      >
        <Info className="h-3.5 w-3.5" />
        <span>{label ?? 'Why?'}</span>
      </button>

      {open && (
        <div className="absolute z-50 bottom-full mb-2 right-0 w-72 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-left">
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900">Reserved for other events</h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading && <p className="text-xs text-gray-500">Loading…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {!loading && !error && conflicts.length === 0 && (
            <p className="text-xs text-gray-500">No conflicting reservations in this window.</p>
          )}

          {!loading && !error && conflicts.length > 0 && (
            <>
              <p className="text-xs text-gray-600 mb-2">
                <span className="font-medium text-gray-900">{totalCommitted}</span>{' '}
                {totalCommitted === 1 ? 'unit is' : 'units are'} committed during your selected window:
              </p>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {conflicts.map((c, idx) => (
                  <li
                    key={`${c.checkoutDate}-${c.returnDate}-${idx}`}
                    className="flex items-center justify-between text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5"
                  >
                    <span className="text-amber-900">
                      {format(parseISO(c.checkoutDate), 'MMM d')} – {format(parseISO(c.returnDate), 'MMM d, yyyy')}
                    </span>
                    <span className="font-medium text-amber-900">
                      {c.quantity} {c.quantity === 1 ? 'unit' : 'units'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-gray-400 mt-2">
                We only show dates and quantities — never other requesters' details.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
