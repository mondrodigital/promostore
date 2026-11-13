import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const POPOVER_WIDTH = 288;
const POPOVER_GAP = 8;
const POPOVER_MAX_HEIGHT = 320;

/**
 * Small info button + popover that, on click, fetches the date-range conflicts
 * for an item via `get_item_conflicts` and displays date ranges and quantities.
 * Use the item calendar for requester names and full booking details.
 */
export default function AvailabilityInfo({ itemId, startDate, endDate, label }: AvailabilityInfoProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ItemConflictRange[]>([]);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

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

  const updatePosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const popoverHeight = popoverRef.current?.offsetHeight ?? POPOVER_MAX_HEIGHT;

    let left = rect.left;
    let top = rect.bottom + POPOVER_GAP;

    if (left + POPOVER_WIDTH > window.innerWidth - POPOVER_GAP) {
      left = window.innerWidth - POPOVER_WIDTH - POPOVER_GAP;
    }
    left = Math.max(POPOVER_GAP, left);

    if (top + popoverHeight > window.innerHeight - POPOVER_GAP) {
      top = rect.top - popoverHeight - POPOVER_GAP;
    }
    top = Math.max(POPOVER_GAP, top);

    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [open, loading, error, conflicts.length]);

  useEffect(() => {
    if (!open) return;

    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  const totalCommitted = conflicts.reduce((sum, c) => sum + c.quantity, 0);

  const popoverContent = open && coords && (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[100] cursor-default bg-transparent"
        aria-label="Close conflict details"
        onClick={() => setOpen(false)}
      />
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Reserved for other events"
        className="fixed z-[101] bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-left"
        style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
      >
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-900 pr-2">Reserved for other events</h4>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
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
                  <span className="font-medium text-amber-900 ml-2 flex-shrink-0">
                    {c.quantity} {c.quantity === 1 ? 'unit' : 'units'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-gray-400 mt-2">
              Open the calendar icon on this item to see who reserved it and the full schedule.
            </p>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="inline-block">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 hover:underline"
        title="Why is this unavailable?"
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5" />
        <span>{label ?? 'Why?'}</span>
      </button>

      {popoverContent && createPortal(popoverContent, document.body)}
    </div>
  );
}
