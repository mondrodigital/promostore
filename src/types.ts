export interface PromoItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  total_quantity: number;
  available_quantity: number;
  created_at?: string;
}

export interface Checkout {
  id: string;
  user_id: string;
  item_id: string;
  quantity: number;
  checkout_date: string;
  return_date: string;
  returned: boolean;
  created_at: string;
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
  checkout_date: string;
  return_date: string;
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