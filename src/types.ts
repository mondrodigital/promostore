export interface PromoItem {
  id: string;
  created_at: string;
  name: string;
  description: string | null;
  total_quantity: number;
  available_quantity: number;
  image_url: string | null;
  category: 'Tents' | 'Tables' | 'Linens' | 'Displays' | 'Decor' | 'Games' | 'Misc';
}

export interface Checkout {
  id: string;
  created_at: string;
  item_id: string;
  checkout_date: string;
  return_date: string;
  quantity: number;
  order_id: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  department: string;
  is_admin: boolean;
}

export interface Order {
  id: string;
  user_name: string;
  user_email: string;
  checkout_date: string | null;
  return_date: string | null;
  created_at: string;
  status: 'pending' | 'picked_up' | 'returned' | 'cancelled' | 'wishlist_only' | 'rejected';
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  item_id: string;
  quantity: number;
  item: PromoItem;
}

export interface CartItem extends PromoItem {
  requestedQuantity: number;
}