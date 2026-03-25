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
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const isAdmin = session.user.user_metadata?.is_admin === true;
        setUser({ ...session.user, is_admin: isAdmin });
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
     const { data, error } = await supabase.auth.signInWithPassword({ email, password });
     return { data, error }; 
  }

  async function signOut() {
    await supabase.auth.signOut();
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