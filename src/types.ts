export interface PromoItem {
  id: number;
  created_at: string;
  name: string;
  description: string | null;
  total_quantity: number;
  available_quantity: number;
  image_url: string | null;
}

export interface Checkout {
  id: number;
  created_at: string;
  item_id: number;
  checkout_date: string;
  return_date: string;
  quantity: number;
  order_id: number;
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
  status: 'pending' | 'picked_up' | 'returned' | 'cancelled';
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