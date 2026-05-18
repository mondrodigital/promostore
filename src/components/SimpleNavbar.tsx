import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogIn, LayoutDashboard, LogOut } from 'lucide-react';
import vellumLogo from '../VellumLogo_Horizontal_Artboard 1.svg';
import { useAuth } from '../context/AuthContext';

export default function SimpleNavbar() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  // Don't show on admin page
  if (location.pathname === '/admin') {
    return null;
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white shadow-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link to="/" className="flex items-center">
              <img src={vellumLogo} alt="Vellum Logo" className="h-10 w-auto" />
            </Link>
          </div>

          {/* Title */}
          <div className="hidden md:block">
            <h1 className="text-lg font-semibold text-gray-800">Event Items Store</h1>
          </div>

          {/* Right Section: Auth Links */}
          <div className="flex items-center space-x-2">
            {user ? (
              <>
                <Link
                  to="/admin"
                  title="Admin Dashboard"
                  className="inline-flex items-center justify-center rounded-full p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none"
                >
                  <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
                </Link>
                <button
                  onClick={signOut}
                  title="Logout"
                  className="inline-flex items-center justify-center rounded-full p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none"
                >
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <Link
                to="/login"
                title="Login"
                className="inline-flex items-center justify-center rounded-full p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none"
              >
                <LogIn className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

