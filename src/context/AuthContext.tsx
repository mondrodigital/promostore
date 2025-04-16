import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ data: { user: any } | null; error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set mock admin user
    setUser({
      id: 'mock-admin-id',
      email: 'admin@example.com',
      full_name: 'Admin User',
      department: 'Administration',
      is_admin: true
    });
    setLoading(false);
  }, []);

  async function signIn(email: string, password: string) {
    // For now, just return mock success
    return {
      data: {
        user: {
          id: 'mock-admin-id',
          email: 'admin@example.com'
        }
      },
      error: null
    };
  }

  async function signOut() {
    setUser(null);
  }

  const value = {
    user,
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}