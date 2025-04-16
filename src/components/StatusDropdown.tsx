import React, { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { ChevronDown } from 'lucide-react';
import type { Order } from '../types';

interface StatusDropdownProps {
  status: Order['status'];
  orderId: string;
  onStatusChange: (orderId: string, newStatus: Order['status']) => Promise<void>;
  disabled?: boolean;
  availableStatuses: Order['status'][];
}

const getStatusColor = (status: Order['status']) => {
  switch (status) {
    case 'pending':
      return 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100';
    case 'picked_up':
      return 'text-blue-600 bg-blue-50 hover:bg-blue-100';
    case 'returned':
      return 'text-green-600 bg-green-50 hover:bg-green-100';
    case 'cancelled':
      return 'text-red-600 bg-red-50 hover:bg-red-100';
    default:
      return 'text-gray-600 bg-gray-50 hover:bg-gray-100';
  }
};

const getStatusLabel = (status: Order['status']): string => {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'picked_up':
      return 'Picked Up';
    case 'returned':
      return 'Returned';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
};

export default function StatusDropdown({ 
  status, 
  orderId, 
  onStatusChange, 
  disabled = false,
  availableStatuses 
}: StatusDropdownProps) {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <Menu.Button
          disabled={disabled}
          className={`
            inline-flex items-center justify-between w-40 px-4 py-2 text-sm font-medium rounded-full
            transition-colors duration-150 ease-in-out
            ${getStatusColor(status)}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:ring-2 hover:ring-offset-2 hover:ring-[#2c3e50]'}
          `}
        >
          {getStatusLabel(status)}
          <ChevronDown className="ml-2 -mr-1 h-4 w-4" aria-hidden="true" />
        </Menu.Button>
      </div>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-2 w-40 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
          <div className="py-1">
            {availableStatuses.map((statusOption) => (
              <Menu.Item key={statusOption}>
                {({ active }) => (
                  <button
                    onClick={() => onStatusChange(orderId, statusOption)}
                    disabled={status === statusOption}
                    className={`
                      ${active ? 'bg-gray-50' : ''}
                      ${status === statusOption ? 'cursor-default' : 'cursor-pointer'}
                      ${getStatusColor(statusOption)}
                      group flex w-full items-center px-4 py-2 text-sm
                      transition-colors duration-150 ease-in-out
                    `}
                  >
                    {getStatusLabel(statusOption)}
                  </button>
                )}
              </Menu.Item>
            ))}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}