import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react';

interface DateRangeDisplayInputProps {
  startDate: Date | null;
  endDate: Date | null;
  onClick?: () => void;
  placeholderStart?: string;
  placeholderEnd?: string;
  className?: string;
}

const DateRangeDisplayInput = forwardRef<HTMLButtonElement, DateRangeDisplayInputProps>(
  (
    {
      startDate,
      endDate,
      onClick,
      placeholderStart = 'Start date',
      placeholderEnd = 'End date',
      className = '',
    },
    ref
  ) => {
    const startText = startDate ? format(startDate, 'MMM d') : placeholderStart;
    const endText = endDate ? format(endDate, 'MMM d') : placeholderEnd;

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={`w-full border border-gray-300 rounded-md shadow-sm bg-white flex items-center justify-between text-left focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none ${className}`}
      >
        <div className="flex-1 px-3 py-2 border-r border-gray-200">
          <span className={`text-sm ${startDate ? 'text-gray-900' : 'text-gray-400'}`}>
            {startText}
          </span>
        </div>
        <div className="flex-1 px-3 py-2">
          <span className={`text-sm ${endDate ? 'text-gray-900' : 'text-gray-400'}`}>
            {endText}
          </span>
        </div>
        <div className="px-2">
           <Calendar className="h-4 w-4 text-gray-400" />
        </div>
      </button>
    );
  }
);

DateRangeDisplayInput.displayName = 'DateRangeDisplayInput';

export default DateRangeDisplayInput; 