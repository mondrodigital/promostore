export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfToday(): Date {
  return startOfDay(new Date());
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function addDays(date: Date, days: number): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function daysBetween(start: Date, end: Date): number {
  const ms = startOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.round(ms / 86400000);
}

export interface CheckoutDates {
  pickupDate: Date | null;
  returnDate: Date | null;
  eventStartDate: Date | null;
  eventEndDate: Date | null;
}

/**
 * Client checks for checkout dates. Past dates and return-before-pickup are
 * blocked here. The 14-day window and event/pickup alignment match the server.
 */
export function checkoutDateError(dates: CheckoutDates): string | null {
  const today = startOfToday();
  const { pickupDate, returnDate, eventStartDate, eventEndDate } = dates;

  if (eventStartDate && startOfDay(eventStartDate) < today) {
    return 'Event start cannot be in the past.';
  }
  if (eventEndDate && startOfDay(eventEndDate) < today) {
    return 'Event end cannot be in the past.';
  }
  if (eventStartDate && eventEndDate && startOfDay(eventEndDate) < startOfDay(eventStartDate)) {
    return 'Event end cannot be before the event start.';
  }
  if (pickupDate && startOfDay(pickupDate) < today) {
    return 'Pickup date cannot be in the past.';
  }
  if (returnDate && startOfDay(returnDate) < today) {
    return 'Return date cannot be in the past.';
  }
  if (pickupDate && returnDate && startOfDay(returnDate) < startOfDay(pickupDate)) {
    return 'Return date must be on or after the pickup date.';
  }
  if (pickupDate && returnDate && daysBetween(pickupDate, returnDate) > 14) {
    return 'Pickup and return must be within 14 days.';
  }
  if (pickupDate && eventStartDate && startOfDay(pickupDate) > startOfDay(eventStartDate)) {
    return 'Pickup date must be on or before the event start date.';
  }
  if (returnDate && eventEndDate && startOfDay(returnDate) < startOfDay(eventEndDate)) {
    return 'Return date must be on or after the event end date.';
  }
  return null;
}
