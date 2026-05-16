import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { PromoItem, CartItem } from '../types';
import { useToast } from './ToastContext';

interface CartContextType {
  items: CartItem[];
  addToCart: (item: PromoItem, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  getItemQuantity: (itemId: string) => number;
  getTotalQuantity: () => number;
  wishlistItems: CartItem[];
  addToWishlist: (item: PromoItem, quantity: number) => void;
  removeFromWishlist: (itemId: string) => void;
  clearWishlist: () => void;
  getWishlistItemQuantity: (itemId: string) => number;
  getTotalWishlistQuantity: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_VERSION = 1;
const CART_STORAGE_KEY = 'lo_cart_v1';
const WISHLIST_STORAGE_KEY = 'lo_wishlist_v1';
const CART_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface StoredCart {
  version: number;
  items: CartItem[];
  savedAt: string;
}

function loadFromLocalStorage(key: string): { items: CartItem[]; expired: boolean } {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return { items: [], expired: false };

    const parsed: StoredCart = JSON.parse(stored);

    if (parsed.version !== CART_VERSION) {
      localStorage.removeItem(key);
      return { items: [], expired: true };
    }

    const savedAt = new Date(parsed.savedAt).getTime();
    if (isNaN(savedAt) || Date.now() - savedAt > CART_TTL_MS) {
      localStorage.removeItem(key);
      return { items: [], expired: true };
    }

    return { items: Array.isArray(parsed.items) ? parsed.items : [], expired: false };
  } catch (error) {
    console.error(`Error reading localStorage key "${key}":`, error);
    return { items: [], expired: false };
  }
}

function saveToLocalStorage(key: string, items: CartItem[]): void {
  try {
    const payload: StoredCart = {
      version: CART_VERSION,
      items,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.error(`Error writing to localStorage key "${key}":`, error);
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { showWarning } = useToast();

  // Track whether either store was discarded as expired, resolved during the
  // synchronous initializer before the component first renders.
  const cartExpiredRef = useRef(false);
  const wishlistExpiredRef = useRef(false);

  const [items, setItems] = useState<CartItem[]>(() => {
    const { items: stored, expired } = loadFromLocalStorage(CART_STORAGE_KEY);
    if (expired) cartExpiredRef.current = true;
    return stored;
  });

  const [wishlistItems, setWishlistItems] = useState<CartItem[]>(() => {
    const { items: stored, expired } = loadFromLocalStorage(WISHLIST_STORAGE_KEY);
    if (expired) wishlistExpiredRef.current = true;
    return stored;
  });

  // Show a single toast if either cart or wishlist was discarded as expired.
  useEffect(() => {
    if (cartExpiredRef.current || wishlistExpiredRef.current) {
      showWarning('Your previous cart has expired');
      cartExpiredRef.current = false;
      wishlistExpiredRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveToLocalStorage(CART_STORAGE_KEY, items);
  }, [items]);

  useEffect(() => {
    saveToLocalStorage(WISHLIST_STORAGE_KEY, wishlistItems);
  }, [wishlistItems]);

  const addToCart = useCallback((item: PromoItem, quantity: number) => {
    setItems(prevItems => {
      const existingItem = prevItems.find(i => String(i.id) === String(item.id));
      if (existingItem) {
        return prevItems.map(i =>
          String(i.id) === String(item.id)
            ? { ...i, requestedQuantity: i.requestedQuantity + quantity }
            : i
        );
      }
      return [...prevItems, { ...item, requestedQuantity: quantity }];
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setItems(prevItems => prevItems.filter(item => String(item.id) !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  }, []);

  const updateQuantity = (itemId: string, quantity: number) => {
    setItems(currentItems =>
      currentItems
        .map(item =>
          String(item.id) === itemId
            ? { ...item, requestedQuantity: quantity > 0 ? quantity : 0 }
            : item
        )
        .filter(item => item.requestedQuantity > 0)
    );
  };

  const getItemQuantity = useCallback((itemId: string): number => {
    const item = items.find(i => String(i.id) === itemId);
    return item ? item.requestedQuantity : 0;
  }, [items]);

  const getTotalQuantity = useCallback((): number => {
    return items.reduce((total, item) => total + item.requestedQuantity, 0);
  }, [items]);

  // --- Wishlist Functions ---
  const addToWishlist = useCallback((item: PromoItem, quantity: number) => {
    setWishlistItems(prevItems => {
      const existingItem = prevItems.find(i => String(i.id) === String(item.id));
      if (existingItem) {
        return prevItems.map(i =>
          String(i.id) === String(item.id)
            ? { ...i, requestedQuantity: i.requestedQuantity + quantity }
            : i
        );
      }
      return [...prevItems, { ...item, requestedQuantity: quantity }];
    });
  }, []);

  const removeFromWishlist = useCallback((itemId: string) => {
    setWishlistItems(prevItems => prevItems.filter(item => String(item.id) !== itemId));
  }, []);

  const clearWishlist = useCallback(() => {
    setWishlistItems([]);
    localStorage.removeItem(WISHLIST_STORAGE_KEY);
  }, []);

  const getWishlistItemQuantity = useCallback((itemId: string): number => {
    const item = wishlistItems.find(i => String(i.id) === itemId);
    return item ? item.requestedQuantity : 0;
  }, [wishlistItems]);

  const getTotalWishlistQuantity = useCallback((): number => {
    return wishlistItems.reduce((total, item) => total + item.requestedQuantity, 0);
  }, [wishlistItems]);

  const value: CartContextType = {
    items,
    addToCart,
    removeFromCart,
    clearCart,
    updateQuantity,
    getItemQuantity,
    getTotalQuantity,
    wishlistItems,
    addToWishlist,
    removeFromWishlist,
    clearWishlist,
    getWishlistItemQuantity,
    getTotalWishlistQuantity,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
