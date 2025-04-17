import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import vellumLogo from '../VellumLogo_Horizontal_Artboard 1.svg';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (_event === 'SIGNED_OUT') {
        navigate('/');
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [navigate]);

  if (location.pathname === '/admin') {
    return null;
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <nav className="bg-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <img src={vellumLogo} alt="Vellum Logo" className="h-8 w-auto" />
            <span className="font-semibold text-xl text-[#58595B]">Event Items Store</span>
          </Link>
          
          <div className="flex items-center space-x-4">
            {session?.user?.user_metadata?.is_admin && (
              <Link 
                to="/admin"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Admin Dashboard
              </Link>
            )}

            {session ? (
              <button
                onClick={handleLogout}
                className="flex items-center text-red-600 hover:text-red-800 px-3 py-2 rounded-md text-sm font-medium hover:bg-red-50"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </button>
            ) : (
              <Link 
                to="/login"
                className="flex items-center text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100"
              >
                <LogIn className="h-4 w-4 mr-1" />
                Admin Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}