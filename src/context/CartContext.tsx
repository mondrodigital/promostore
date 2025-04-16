import React, { createContext, useContext, useState, useEffect } from 'react';
import type { PromoItem } from '../types';

interface CartItem extends PromoItem {
  requestedQuantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: PromoItem, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  getItemQuantity: (itemId: string) => number;
  getTotalQuantity: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'promo_inventory_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    // Load initial state from localStorage
    const savedCart = localStorage.getItem(CART_STORAGE_KEY);
    return savedCart ? JSON.parse(savedCart) : [];
  });

  // Save to localStorage whenever cart changes
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addToCart = (item: PromoItem, quantity: number) => {
    setItems(currentItems => {
      const existingItem = currentItems.find(i => i.id === item.id);
      if (existingItem) {
        return currentItems.map(i =>
          i.id === item.id
            ? { ...i, requestedQuantity: i.requestedQuantity + quantity }
            : i
        );
      }
      return [...currentItems, { ...item, requestedQuantity: quantity }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setItems(currentItems => currentItems.filter(item => item.id !== itemId));
  };

  const clearCart = () => {
    setItems([]);
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    setItems(currentItems =>
      currentItems.map(item =>
        item.id === itemId
          ? { ...item, requestedQuantity: quantity }
          : item
      )
    );
  };

  const getItemQuantity = (itemId: string) => {
    return items.find(item => item.id === itemId)?.requestedQuantity || 0;
  };

  const getTotalQuantity = () => {
    return items.reduce((total, item) => total + item.requestedQuantity, 0);
  };

  return (
    <CartContext.Provider value={{
      items,
      addToCart,
      removeFromCart,
      clearCart,
      updateQuantity,
      getItemQuantity,
      getTotalQuantity,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}