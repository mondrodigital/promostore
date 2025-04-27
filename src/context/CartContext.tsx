import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { PromoItem, CartItem } from '../types';

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

const CART_STORAGE_KEY = 'promo_inventory_cart';

// Helper to load from session storage
const loadFromSession = <T,>(key: string, defaultValue: T): T => {
  try {
    const stored = sessionStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    console.error(`Error reading sessionStorage key \"${key}\":`, error);
    return defaultValue;
  }
};

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadFromSession<CartItem[]>('cartItems', []));
  const [wishlistItems, setWishlistItems] = useState<CartItem[]>(() => loadFromSession<CartItem[]>('wishlistItems', []));

  // Save cart items to session storage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem('cartItems', JSON.stringify(items));
    } catch (error) {
      console.error('Error writing cartItems to sessionStorage:', error);
    }
  }, [items]);

  // Save wishlist items to session storage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem('wishlistItems', JSON.stringify(wishlistItems));
    } catch (error) {
      console.error('Error writing wishlistItems to sessionStorage:', error);
    }
  }, [wishlistItems]);

  const addToCart = useCallback((item: PromoItem, quantity: number) => {
    setItems(prevItems => {
      const existingItem = prevItems.find(i => String(i.id) === String(item.id));
      if (existingItem) {
        // Update quantity if item already exists
        return prevItems.map(i =>
          String(i.id) === String(item.id)
            ? { ...i, requestedQuantity: i.requestedQuantity + quantity }
            : i
        );
      } else {
        // Add new item to cart
        return [...prevItems, { ...item, requestedQuantity: quantity }];
      }
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setItems(prevItems => prevItems.filter(item => String(item.id) !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    sessionStorage.removeItem('cartItems'); // Clear storage too
  }, []);

  const updateQuantity = (itemId: string, quantity: number) => {
    setItems(currentItems =>
      currentItems.map(item =>
        String(item.id) === itemId // Compare as strings
          ? { ...item, requestedQuantity: quantity > 0 ? quantity : 0 } // Ensure quantity doesn't go below 0
          : item
      ).filter(item => item.requestedQuantity > 0) // Remove item if quantity is 0
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
        // Update quantity if item already exists
        return prevItems.map(i =>
          String(i.id) === String(item.id)
            ? { ...i, requestedQuantity: i.requestedQuantity + quantity }
            : i
        );
      } else {
        // Add new item to wishlist
        return [...prevItems, { ...item, requestedQuantity: quantity }];
      }
    });
  }, []);

  const removeFromWishlist = useCallback((itemId: string) => {
    setWishlistItems(prevItems => prevItems.filter(item => String(item.id) !== itemId));
  }, []);

  const clearWishlist = useCallback(() => {
    setWishlistItems([]);
    sessionStorage.removeItem('wishlistItems'); // Clear storage too
  }, []);

  const getWishlistItemQuantity = useCallback((itemId: string): number => {
    const item = wishlistItems.find(i => String(i.id) === itemId);
    return item ? item.requestedQuantity : 0;
  }, [wishlistItems]);

   const getTotalWishlistQuantity = useCallback((): number => {
    return wishlistItems.reduce((total, item) => total + item.requestedQuantity, 0);
  }, [wishlistItems]);

  // Updated context value
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
    throw new Error('useCart must be used within an CartProvider');
  }
  return context;
}