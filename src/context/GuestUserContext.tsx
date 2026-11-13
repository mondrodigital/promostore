import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  GUEST_EMAIL_STORAGE_KEY,
  GUEST_NAME_STORAGE_KEY,
  STOREFRONT_CLEAR_EVENT,
  requestStorefrontSessionClear,
} from '../lib/storefrontSession';

interface GuestUserContextType {
  guestEmail: string | null;
  guestName: string | null;
  setGuestEmail: (email: string | null) => void;
  setGuestName: (name: string | null) => void;
  clearGuestEmail: () => void;
  clearGuestProfile: () => void;
  /** Clears guest profile, cart, wishlist, and event-details session for a full identity switch. */
  clearStorefrontSession: () => void;
  isGuestEmailSet: boolean;
}

const GuestUserContext = createContext<GuestUserContextType | undefined>(undefined);

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

  // Reset in-memory guest state when any caller requests a full storefront clear.
  useEffect(() => {
    const onClear = () => {
      setGuestEmailState(null);
      setGuestNameState(null);
    };
    window.addEventListener(STOREFRONT_CLEAR_EVENT, onClear);
    return () => window.removeEventListener(STOREFRONT_CLEAR_EVENT, onClear);
  }, []);

  const setGuestEmail = useCallback((email: string | null) => {
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
  }, []);

  const setGuestName = useCallback((name: string | null) => {
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
  }, []);

  const clearGuestEmail = useCallback(() => {
    setGuestEmail(null);
  }, [setGuestEmail]);

  const clearGuestProfile = useCallback(() => {
    setGuestEmail(null);
    setGuestName(null);
  }, [setGuestEmail, setGuestName]);

  const clearStorefrontSession = useCallback(() => {
    requestStorefrontSessionClear();
  }, []);

  const value = {
    guestEmail,
    guestName,
    setGuestEmail,
    setGuestName,
    clearGuestEmail,
    clearGuestProfile,
    clearStorefrontSession,
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
