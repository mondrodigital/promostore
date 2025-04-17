import React, { forwardRef } from 'react';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

interface DatePickerInputProps {
  value: Date | null;
  onClick?: () => void;
  placeholder?: string;
  isActive?: boolean;
  disabled?: boolean;
}

const DatePickerInput = forwardRef<HTMLButtonElement, DatePickerInputProps>(
  ({ value, onClick, placeholder = 'Select date', isActive = false, disabled = false }, ref) => (
    <button
      onClick={onClick}
      ref={ref}
      type="button"
      disabled={disabled}
      className={clsx(
        'w-full px-3 py-2 text-left border rounded-lg shadow-sm text-sm',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
        'transition-colors duration-200',
        'bg-white',
        isActive 
          ? 'border-blue-500 ring-2 ring-blue-500' 
          : 'border-gray-300 hover:border-gray-400',
        disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed opacity-75' : ''
      )}
    >
      <div className="flex items-center">
        <Calendar className="h-5 w-5 text-gray-400 mr-2 flex-shrink-0" />
        <span className={clsx(
          'truncate',
          value ? 'text-gray-900' : 'text-gray-500'
        )}>
          {value ? format(value, 'MMM d, yyyy') : placeholder}
        </span>
      </div>
    </button>
  )
);

DatePickerInput.displayName = 'DatePickerInput';

export default DatePickerInput;