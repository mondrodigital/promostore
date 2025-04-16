import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Package2 } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();

  // Hide navbar completely on admin dashboard
  if (location.pathname === '/admin') {
    return null;
  }

  return (
    <nav className="bg-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Package2 className="h-6 w-6 text-blue-600" />
            <span className="font-semibold text-xl">Promo Inventory</span>
          </Link>
          
          <div className="flex items-center space-x-4">
            <Link 
              to="/admin"
              className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
            >
              Admin Dashboard
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}