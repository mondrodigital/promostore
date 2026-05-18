import { useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import { format, addDays } from 'date-fns';
import { X, CalendarDays, Truck, AlertCircle, User, Mail } from 'lucide-react';
import "react-datepicker/dist/react-datepicker.css";

// Keep in sync with the same constants in HomePage.tsx / BottomRequestBar.tsx
// and the `chk_max_checkout_duration` constraint on the orders table.
const MAX_CHECKOUT_DAYS = 14;

export interface EventDetailsFormData {
  name: string;
  email: string;
  eventStartDate: Date | null;
  eventEndDate: Date | null;
  pickupDate: Date | null;
  returnDate: Date | null;
}

interface EventDetailsModalProps {
  /**
   * `required` - hard gate: no close button, overlay clicks ignored. Used on
   * first visit before the user has set dates so the storefront has real
   * availability data to show.
   * `edit` - soft modal: close button + overlay-click dismiss. Used when the
   * user re-opens the form from the bottom bar to tweak details.
   */
  mode: 'required' | 'edit';
  initialValues: EventDetailsFormData;
  onSubmit: (values: EventDetailsFormData) => void;
  onCancel?: () => void;
}

const isVellumEmail = (email: string) =>
  email.toLowerCase().endsWith('@vellummortgage.com');

export default function EventDetailsModal({
  mode,
  initialValues,
  onSubmit,
  onCancel,
}: EventDetailsModalProps) {
  const [values, setValues] = useState<EventDetailsFormData>(initialValues);
  const [showErrors, setShowErrors] = useState(false);

  // Re-sync local state when the parent provides a new snapshot (e.g. user
  // re-opens the modal in edit mode after partial changes elsewhere).
  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const validate = (v: EventDetailsFormData) => {
    const errors: {
      name?: string;
      email?: string;
      eventDates?: string;
      pickupDates?: string;
    } = {};

    if (!v.name.trim()) errors.name = 'Please enter your name.';

    if (!v.email.trim()) {
      errors.email = 'Please enter your email.';
    } else if (!isVellumEmail(v.email)) {
      errors.email = 'Please use your @vellummortgage.com email address.';
    }

    if (!v.eventStartDate || !v.eventEndDate) {
      errors.eventDates = 'Select both event start and end dates.';
    }

    if (!v.pickupDate || !v.returnDate) {
      errors.pickupDates = 'Select both pickup and return dates.';
    } else {
      const diffDays = Math.round(
        (v.returnDate.getTime() - v.pickupDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (diffDays > MAX_CHECKOUT_DAYS) {
        errors.pickupDates = `Return date is ${diffDays} days after pickup. The maximum checkout window is ${MAX_CHECKOUT_DAYS} days.`;
      }
    }

    if (v.pickupDate && v.eventStartDate && v.pickupDate > v.eventStartDate) {
      errors.pickupDates = errors.pickupDates
        ? `${errors.pickupDates} Also, pickup must be on or before the event start date.`
        : 'Pickup date must be on or before the event start date.';
    }

    if (v.returnDate && v.eventEndDate && v.returnDate < v.eventEndDate) {
      errors.pickupDates = errors.pickupDates
        ? `${errors.pickupDates} Also, return date must be on or after the event end date.`
        : 'Return date must be on or after the event end date.';
    }

    return errors;
  };

  const errors = validate(values);
  const isValid = Object.keys(errors).length === 0;

  const handleEventDateChange = (dates: [Date | null, Date | null]) => {
    const [start, end] = dates;
    setValues(prev => ({ ...prev, eventStartDate: start, eventEndDate: end }));
  };

  const handlePickupReturnDateChange = (
    dates: [Date | null, Date | null],
  ) => {
    const [start, end] = dates;
    setValues(prev => ({ ...prev, pickupDate: start, returnDate: end }));
  };

  const handleSubmit = () => {
    if (!isValid) {
      setShowErrors(true);
      return;
    }
    onSubmit(values);
  };

  const handleOverlayClick = () => {
    if (mode === 'edit' && onCancel) onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black bg-opacity-60"
        onClick={handleOverlayClick}
      />

      <div className="relative z-50 w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        {mode === 'edit' && onCancel && (
          <button
            onClick={onCancel}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">
            {mode === 'required'
              ? 'Tell us about your event'
              : 'Update your event details'}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {mode === 'required'
              ? 'We use these details to show you what is actually available for your dates. You can change them later.'
              : 'Changes will update availability across the store.'}
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-4 w-4 text-[#0075AE]" />
                  Your Name <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="text"
                placeholder="Enter your name"
                value={values.name}
                onChange={e =>
                  setValues(prev => ({ ...prev, name: e.target.value }))
                }
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none ${
                  showErrors && errors.name
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300'
                }`}
              />
              {showErrors && errors.name && (
                <p className="mt-1 text-xs text-red-600 flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-[#0075AE]" />
                  Email Address <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="email"
                placeholder="your.email@vellummortgage.com"
                value={values.email}
                onChange={e =>
                  setValues(prev => ({ ...prev, email: e.target.value }))
                }
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none ${
                  showErrors && errors.email
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300'
                }`}
              />
              {showErrors && errors.email && (
                <p className="mt-1 text-xs text-red-600 flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  {errors.email}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                <CalendarDays className="h-4 w-4 text-[#0075AE]" />
                Event dates <span className="text-red-500">*</span>
              </div>
              <div className="flex justify-center">
                <DatePicker
                  selectsRange
                  inline
                  monthsShown={1}
                  startDate={values.eventStartDate}
                  endDate={values.eventEndDate}
                  onChange={handleEventDateChange}
                  minDate={new Date()}
                />
              </div>
              <p className="mt-2 text-xs text-gray-600">
                {values.eventStartDate
                  ? `${format(values.eventStartDate, 'MMM d, yyyy')}${
                      values.eventEndDate
                        ? ` - ${format(values.eventEndDate, 'MMM d, yyyy')}`
                        : ' (select an end date)'
                    }`
                  : 'When is your event taking place?'}
              </p>
              {showErrors && errors.eventDates && (
                <p className="mt-1 text-xs text-red-600 flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  {errors.eventDates}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900">
                <Truck className="h-4 w-4 text-[#0075AE]" />
                Pickup &amp; return <span className="text-red-500">*</span>
                <span className="ml-1 font-normal text-gray-400 text-xs">
                  (max {MAX_CHECKOUT_DAYS} days)
                </span>
              </div>
              <div className="flex justify-center">
                <DatePicker
                  selectsRange
                  inline
                  monthsShown={1}
                  startDate={values.pickupDate}
                  endDate={values.returnDate}
                  onChange={handlePickupReturnDateChange}
                  minDate={new Date()}
                  maxDate={
                    values.pickupDate
                      ? addDays(values.pickupDate, MAX_CHECKOUT_DAYS)
                      : undefined
                  }
                />
              </div>
              <p className="mt-2 text-xs text-gray-600">
                {values.pickupDate
                  ? `${format(values.pickupDate, 'MMM d, yyyy')}${
                      values.returnDate
                        ? ` - ${format(values.returnDate, 'MMM d, yyyy')}`
                        : ' (select a return date)'
                    }`
                  : 'When will you pick up and return the items?'}
              </p>
              {showErrors && errors.pickupDates && (
                <p className="mt-1 text-xs text-red-600 flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  {errors.pickupDates}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex items-center justify-end gap-3">
          {mode === 'edit' && onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={showErrors && !isValid}
            className="bg-[#0075AE] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[#005f8c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mode === 'required' ? 'Continue to store' : 'Save details'}
          </button>
        </div>
      </div>
    </div>
  );
}
