import React, { createContext, useContext, useState, useEffect } from 'react';

interface GuestUserContextType {
  guestEmail: string | null;
  setGuestEmail: (email: string | null) => void;
  clearGuestEmail: () => void;
  isGuestEmailSet: boolean;
}

const GuestUserContext = createContext<GuestUserContextType | undefined>(undefined);

const GUEST_EMAIL_STORAGE_KEY = 'vellum_guest_email';

export function GuestUserProvider({ children }: { children: React.ReactNode }) {
  const [guestEmail, setGuestEmailState] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GUEST_EMAIL_STORAGE_KEY);
      if (stored) {
        setGuestEmailState(stored);
      }
    } catch (error) {
      console.error('Error loading guest email from storage:', error);
    }
  }, []);

  // Save to localStorage whenever it changes
  const setGuestEmail = (email: string | null) => {
    setGuestEmailState(email);
    try {
      if (email) {
        localStorage.setItem(GUEST_EMAIL_STORAGE_KEY, email);
      } else {
        localStorage.removeItem(GUEST_EMAIL_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Error saving guest email to storage:', error);
    }
  };

  const clearGuestEmail = () => {
    setGuestEmail(null);
  };

  const value = {
    guestEmail,
    setGuestEmail,
    clearGuestEmail,
    isGuestEmailSet: guestEmail !== null,
  };

  return (
    <GuestUserContext.Provider value={value}>
      {children}
    </GuestUserContext.Provider>
  );
}

export function useGuestUser() {
  const context = useContext(GuestUserContext);
  if (context === undefined) {
    throw new Error('useGuestUser must be used within a GuestUserProvider');
  }
  return context;
}

