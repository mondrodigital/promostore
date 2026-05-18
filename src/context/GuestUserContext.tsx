import React, { createContext, useContext, useState, useEffect } from 'react';

interface GuestUserContextType {
  guestEmail: string | null;
  guestName: string | null;
  setGuestEmail: (email: string | null) => void;
  setGuestName: (name: string | null) => void;
  clearGuestEmail: () => void;
  clearGuestProfile: () => void;
  isGuestEmailSet: boolean;
}

const GuestUserContext = createContext<GuestUserContextType | undefined>(undefined);

const GUEST_EMAIL_STORAGE_KEY = 'vellum_guest_email';
const GUEST_NAME_STORAGE_KEY = 'vellum_guest_name';

export function GuestUserProvider({ children }: { children: React.ReactNode }) {
  const [guestEmail, setGuestEmailState] = useState<string | null>(null);
  const [guestName, setGuestNameState] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedEmail = localStorage.getItem(GUEST_EMAIL_STORAGE_KEY);
      if (storedEmail) {
        setGuestEmailState(storedEmail);
      }
      const storedName = localStorage.getItem(GUEST_NAME_STORAGE_KEY);
      if (storedName) {
        setGuestNameState(storedName);
      }
    } catch (error) {
      console.error('Error loading guest profile from storage:', error);
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

  const setGuestName = (name: string | null) => {
    setGuestNameState(name);
    try {
      if (name) {
        localStorage.setItem(GUEST_NAME_STORAGE_KEY, name);
      } else {
        localStorage.removeItem(GUEST_NAME_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Error saving guest name to storage:', error);
    }
  };

  const clearGuestEmail = () => {
    setGuestEmail(null);
  };

  const clearGuestProfile = () => {
    setGuestEmail(null);
    setGuestName(null);
  };

  const value = {
    guestEmail,
    guestName,
    setGuestEmail,
    setGuestName,
    clearGuestEmail,
    clearGuestProfile,
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

