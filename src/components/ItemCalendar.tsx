import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { supabase } from '../lib/supabase';

interface ItemSchedule {
  id: string;
  checkout_date: string;
  return_date: string;
  actual_pickup_date?: string | null;
  actual_return_date?: string | null;
  status: 'pending' | 'picked_up' | 'returned' | 'cancelled';
  user_name: string;
  quantity: number;
}

interface ItemCalendarProps {
  itemId: number;
  itemName: string;
}

export default function ItemCalendar({ itemId, itemName }: ItemCalendarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [schedules, setSchedules] = useState<ItemSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const calendarRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSchedules();
      positionCalendar();
      document.addEventListener('click', handleClickOutside);
      window.addEventListener('scroll', positionCalendar);
      window.addEventListener('resize', positionCalendar);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', positionCalendar);
      window.removeEventListener('resize', positionCalendar);
    };
  }, [isOpen, currentDate]);

  const handleClickOutside = (event: MouseEvent) => {
    if (
      calendarRef.current && 
      buttonRef.current && 
      !calendarRef.current.contains(event.target as Node) &&
      !buttonRef.current.contains(event.target as Node)
    ) {
      setIsOpen(false);
    }
  };

  const positionCalendar = () => {
    if (!calendarRef.current || !buttonRef.current) return;

    const button = buttonRef.current;
    const calendar = calendarRef.current;
    const buttonRect = button.getBoundingClientRect();

    // Calculate position relative to the button
    let top = buttonRect.bottom + 8; // 8px gap
    let left = buttonRect.left;

    // Adjust for viewport edges
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const calendarRect = calendar.getBoundingClientRect();

    // Check right edge
    if (left + calendarRect.width > viewportWidth - 16) {
      left = viewportWidth - calendarRect.width - 16;
    }

    // Check bottom edge
    if (top + calendarRect.height > viewportHeight - 16) {
      top = buttonRect.top - calendarRect.height - 8;
    }

    // Check left edge
    if (left < 16) {
      left = 16;
    }

    // Apply position
    calendar.style.position = 'fixed';
    calendar.style.top = `${top}px`;
    calendar.style.left = `${left}px`;
    calendar.style.zIndex = '50';
  };

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      setError(null);

      const startDate = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(addMonths(currentDate, 1)), 'yyyy-MM-dd');

      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id,
          checkout_date,
          return_date,
          status,
          user_name,
          checkouts!inner (
            quantity,
            picked_up,
            returned,
            created_at,
            updated_at
          )
        `)
        .eq('checkouts.item_id', itemId)
        .gte('checkout_date', startDate)
        .lte('return_date', endDate)
        .not('status', 'eq', 'cancelled');

      if (fetchError) throw fetchError;

      // Transform the data to include actual pickup/return dates
      const transformedData = (data || []).map(order => ({
        id: order.id,
        checkout_date: order.checkout_date,
        return_date: order.return_date,
        status: order.status,
        user_name: order.user_name,
        quantity: order.checkouts[0].quantity,
        actual_pickup_date: order.status === 'picked_up' || order.status === 'returned' 
          ? format(parseISO(order.checkouts[0].updated_at), 'yyyy-MM-dd')
          : null,
        actual_return_date: order.status === 'returned'
          ? format(parseISO(order.checkouts[0].updated_at), 'yyyy-MM-dd')
          : null
      }));

      setSchedules(transformedData);
    } catch (err: any) {
      console.error('Error fetching schedules:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: ItemSchedule['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'picked_up':
        return 'bg-blue-100 text-blue-800';
      case 'returned':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getDaySchedules = (date: Date): ItemSchedule[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return schedules.filter(schedule => {
      if (schedule.status === 'pending') {
        // For pending orders, show scheduled dates
        return dateStr >= schedule.checkout_date && dateStr <= schedule.return_date;
      } else if (schedule.status === 'picked_up' && schedule.actual_pickup_date) {
        // For picked up orders, show from actual pickup date to expected return date
        return dateStr >= schedule.actual_pickup_date && dateStr <= schedule.return_date;
      } else if (schedule.status === 'returned' && schedule.actual_pickup_date && schedule.actual_return_date) {
        // For returned orders, show actual pickup to actual return dates
        return dateStr >= schedule.actual_pickup_date && dateStr <= schedule.actual_return_date;
      }
      return false;
    });
  };

  const renderCalendar = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });

    const weeks: (Date | null)[][] = [];
    let week: (Date | null)[] = [];

    // Add empty cells for days before the first of the month
    const firstDay = start.getDay();
    for (let i = 0; i < firstDay; i++) {
      week.push(null);
    }

    days.forEach(day => {
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
      week.push(day);
    });

    // Add empty cells for days after the last of the month
    while (week.length < 7) {
      week.push(null);
    }
    weeks.push(week);

    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentDate(prev => subMonths(prev, 1))}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setCurrentDate(prev => addMonths(prev, 1))}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
            <div key={day} className="text-center text-sm text-gray-500">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((day, idx) => {
            if (!day) {
              return <div key={`empty-${idx}`} className="h-10" />;
            }

            const daySchedules = getDaySchedules(day);
            const hasSchedules = daySchedules.length > 0;
            const dateStr = format(day, 'yyyy-MM-dd');

            return (
              <div
                key={dateStr}
                className={`
                  h-10 p-1 text-sm relative group
                  ${!isSameMonth(day, currentDate) ? 'text-gray-400' : 'text-gray-900'}
                  ${hasSchedules ? 'bg-blue-50' : ''}
                `}
              >
                <span className="absolute top-1 left-1">{format(day, 'd')}</span>
                {hasSchedules && (
                  <>
                    <div className="absolute bottom-1 right-1 flex gap-1">
                      {daySchedules.map((schedule, index) => (
                        <div
                          key={`${schedule.id}-${index}`}
                          className={`
                            w-2 h-2 rounded-full
                            ${getStatusColor(schedule.status)}
                          `}
                        />
                      ))}
                    </div>
                    <div className="absolute left-0 bottom-full mb-2 w-64 bg-white rounded-lg shadow-lg p-2 hidden group-hover:block z-[60]">
                      {daySchedules.map((schedule, index) => (
                        <div key={`${schedule.id}-${index}`} className="text-xs mb-2 last:mb-0">
                          <div className={`inline-block px-1.5 py-0.5 rounded-full mb-1 ${getStatusColor(schedule.status)}`}>
                            {schedule.status}
                          </div>
                          <div className="font-medium">{schedule.user_name}</div>
                          <div>Quantity: {schedule.quantity}</div>
                          {schedule.status === 'pending' && (
                            <div className="text-gray-500">
                              Scheduled: {format(parseISO(schedule.checkout_date), 'MMM d')} - {format(parseISO(schedule.return_date), 'MMM d')}
                            </div>
                          )}
                          {schedule.status === 'picked_up' && schedule.actual_pickup_date && (
                            <>
                              <div className="text-gray-500">
                                Picked up: {format(parseISO(schedule.actual_pickup_date), 'MMM d')}
                              </div>
                              <div className="text-gray-500">
                                Expected return: {format(parseISO(schedule.return_date), 'MMM d')}
                              </div>
                            </>
                          )}
                          {schedule.status === 'returned' && schedule.actual_pickup_date && schedule.actual_return_date && (
                            <>
                              <div className="text-gray-500">
                                Was picked up: {format(parseISO(schedule.actual_pickup_date), 'MMM d')}
                              </div>
                              <div className="text-gray-500">
                                Returned: {format(parseISO(schedule.actual_return_date), 'MMM d')}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
        title="View schedule"
      >
        <CalendarIcon className="h-5 w-5" />
      </button>

      {isOpen && (
        <div
          ref={calendarRef}
          className="absolute bg-white rounded-lg shadow-xl border border-gray-200 w-[340px]"
          style={{ visibility: 'visible' }}
        >
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">{itemName}</h3>
          </div>

          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading schedule...</div>
          ) : (
            renderCalendar()
          )}
        </div>
      )}
    </div>
  );
}