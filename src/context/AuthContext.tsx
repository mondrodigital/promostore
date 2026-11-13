import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { requestStorefrontSessionClear } from '../lib/storefrontSession';

interface AppUser extends SupabaseUser {
  is_admin?: boolean;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function toAppUser(sessionUser: SupabaseUser): AppUser {
  const isAdmin = sessionUser.user_metadata?.is_admin === true;
  return { ...sessionUser, is_admin: isAdmin };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(toAppUser(session.user));
      } else {
        // Any null-session event (SIGNED_OUT, expired token, etc.) must drop auth state.
        setUser(null);
        if (event === 'SIGNED_OUT') {
          // Also wipe guest/cart/event-details so the next visitor doesn't inherit
          // the previous LO's "On your order" badges or request draft.
          requestStorefrontSessionClear();
        }
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
    // Clear storefront identity even if the auth call fails (stale session, offline).
    requestStorefrontSessionClear();
    await supabase.auth.signOut();
  }

  const value = {
    user,
    loading,
    signIn,
    signOut,
  };

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
