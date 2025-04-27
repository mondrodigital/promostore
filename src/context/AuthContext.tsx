import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// Define our app-specific User type (if different from SupabaseUser or needs additions)
// For now, let's assume we want the Supabase user object directly, 
// potentially adding our custom fields like is_admin later if needed.
interface AppUser extends SupabaseUser {
  is_admin?: boolean; // Add custom fields if they exist in your user metadata or profiles table
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  // Keep signIn signature simple for now, can add password if needed
  signIn: (email: string, password: string) => Promise<any>; 
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // --- START: Real Supabase Auth --- 
    const fetchSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        // Fetch user profile/metadata if session exists to check is_admin
        if (session?.user) {
          // Example: Check user metadata for is_admin flag
          const isAdmin = session.user.user_metadata?.is_admin === true;
          setUser({ ...session.user, is_admin: isAdmin }); 
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Error fetching session:", error);
        setUser(null); // Ensure user is null on error
      } finally {
        setLoading(false);
      }
    };

    fetchSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Auth state changed:", _event, session);
      // Fetch profile/metadata again on sign-in/sign-out
       if (session?.user) {
          const isAdmin = session.user.user_metadata?.is_admin === true;
          setUser({ ...session.user, is_admin: isAdmin }); 
        } else {
          setUser(null);
        }
        setLoading(false); // Ensure loading is false after auth state change
    });
    // --- END: Real Supabase Auth ---

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Real signIn function
  async function signIn(email: string, password: string) {
     setLoading(true);
     const { data, error } = await supabase.auth.signInWithPassword({ email, password });
     setLoading(false);
     // Note: onAuthStateChange should handle setting the user state
     if (error) console.error("Sign in error:", error);
     return { data, error }; 
  }

  // Real signOut function
  async function signOut() {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    // Note: onAuthStateChange should handle setting user state to null
    if (error) console.error("Sign out error:", error);
    setLoading(false);
  }

  const value = {
    user,
    loading,
    signIn,
    signOut,
  };

  // Only render children when loading is false to prevent flashes of incorrect state
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}