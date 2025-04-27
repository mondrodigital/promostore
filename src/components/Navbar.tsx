import React, { useState, useEffect, Fragment } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, LayoutDashboard, Search, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import vellumLogo from '../VellumLogo_Horizontal_Artboard 1.svg';
import { useAuth } from '../context/AuthContext';
import TopBookingBar from './TopBookingBar';
import type { CartItem } from '../types'; // Assuming CartItem type is in types.ts

// Define props accepted by Navbar (including those needed by TopBookingBar)
interface NavbarProps {
  // Scroll/Expand state
  isScrolled: boolean;
  isSearchExpanded: boolean;
  onToggleSearchExpand: () => void;
  // Text for consolidated view
  eventDateText: string;
  pickupReturnDateText: string;
  // Props for TopBookingBar
  formData: {
    name: string;
    email: string;
    pickupDate: Date | null;
    returnDate: Date | null;
    eventStartDate: Date | null;
    eventEndDate: Date | null;
  };
  onFormDataChange: (field: string, value: any) => void;
  onEventDateChange: (dates: [Date | null, Date | null]) => void;
  onPickupReturnDateChange: (dates: [Date | null, Date | null]) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  // Cart props to pass down
  cartItems: CartItem[];
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  getTotalQuantity: () => number;
  // Add Wishlist Props
  wishlistItems: CartItem[];
  removeFromWishlist: (itemId: string) => void;
}

export default function Navbar({ 
  isScrolled, 
  isSearchExpanded, 
  onToggleSearchExpand,
  eventDateText,
  pickupReturnDateText,
  formData,
  onFormDataChange,
  onEventDateChange,
  onPickupReturnDateChange,
  onSubmit,
  isSubmitting,
  cartItems,
  removeFromCart,
  clearCart,
  getTotalQuantity,
  wishlistItems,
  removeFromWishlist,
}: NavbarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      await supabase.auth.getSession();
      setLoading(false);
    };
    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'SIGNED_OUT') {
        // Optional: could navigate here, but useAuth context change should handle it
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Determine if the consolidated search should be shown
  const showConsolidatedSearch = isScrolled && !isSearchExpanded;
  // Determine if the full booking bar should be shown
  const showFullBookingBar = !isScrolled || (isScrolled && isSearchExpanded);

  if (location.pathname === '/admin') {
    return null;
  }

  if (loading) {
    return null;
  }

  return (
    <div className={`fixed top-0 left-0 right-0 z-30 bg-white shadow-md transition-all duration-300 ${isScrolled && isSearchExpanded ? 'pb-2' : ''}`}>
      {/* Outer container for full width */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"> {/* Use same padding/max-width as main content */} 
        {/* Top part of the Navbar (always visible, height h-20) */}
        <nav className="h-20 flex items-center justify-between"> {/* Removed px-6 */}
          {/* Logo */} 
          <div className="flex-shrink-0">
            <Link to="/" className="flex items-center">
              <img src={vellumLogo} alt="Vellum Logo" className="h-12 w-auto" />
            </Link>
          </div>

          {/* Center Section: Consolidated Button or Empty Space */}
          <div className="flex-grow flex justify-center">
            {showConsolidatedSearch ? (
              <button 
                onClick={onToggleSearchExpand}
                className="flex items-center gap-3 px-4 py-2 rounded-full border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <span className="text-sm font-medium text-gray-700">{eventDateText}</span>
                <span className="h-6 border-l border-gray-300"></span>
                <span className="text-sm font-medium text-gray-700">{pickupReturnDateText}</span>
                <span className="h-6 border-l border-gray-300"></span>
                <span className="text-sm text-gray-500">Name | Email</span> 
                <span className="bg-[#0075AE] text-white rounded-full p-1.5 ml-2">
                  <Search className="h-4 w-4" />
                </span>
              </button>
            ) : (
              // Empty div to maintain layout when consolidated button isn't shown
              <div></div> 
            )}
          </div>

          {/* Right Section: Direct Links/Buttons */}
          <div className="flex items-center flex-shrink-0 space-x-2">
            {user ? (
              // Logged In: Admin Link + Logout Button
              <>
                <Link 
                  to="/admin" 
                  title="Admin Dashboard"
                  className="inline-flex justify-center w-full rounded-full p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
                >
                  <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
                </Link>
                <button 
                  onClick={signOut} 
                  title="Logout"
                  className="inline-flex justify-center w-full rounded-full p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
                  >
                    <LogOut className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            ) : (
              // Logged Out: Login Link
              <Link 
                to="/login" 
                title="Login"
                className="inline-flex justify-center w-full rounded-full p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
                >
                  <LogIn className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}
          </div>
        </nav>
      </div> {/* Close max-width container */}

      {/* Conditionally Render TopBookingBar *outside* the max-width container if it should span full width OR *inside* if it should be constrained */}
      {/* Let's keep it constrained for now, assuming it should align */} 
      <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 transition-all duration-300 ease-in-out overflow-hidden ${showFullBookingBar ? 'max-h-[100px]' : 'max-h-0'}`}>
        <TopBookingBar 
           // Pass only the necessary props for TopBookingBar itself
           formData={formData}
           onFormDataChange={onFormDataChange} 
           onEventDateChange={onEventDateChange}
           onPickupReturnDateChange={onPickupReturnDateChange}
           onSubmit={onSubmit}
           isSubmitting={isSubmitting}
           // Pass cart props
           cartItems={cartItems}
           removeFromCart={removeFromCart}
           clearCart={clearCart}
           getTotalQuantity={getTotalQuantity}
           // Pass wishlist props
           wishlistItems={wishlistItems}
           removeFromWishlist={removeFromWishlist}
        />
      </div>
    </div>
  );
}