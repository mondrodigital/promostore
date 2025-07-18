import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Package2, Plus, Pencil, Trash2, X, ShoppingBag, Calendar, User, LayoutDashboard, Upload, Mail, Edit, LogOut } from 'lucide-react';
import { format, parseISO, isValid, parse } from 'date-fns';
import { Link } from 'react-router-dom';
import type { Order as BaseOrder, PromoItem as BasePromoItem, Checkout as BaseCheckout } from '../types';
import StatusDropdown from '../components/StatusDropdown';
import { useAuth } from '../context/AuthContext';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import DatePickerInput from '../components/DatePickerInput';
import vellumLogoWhite from '../Logo_Horizontal_White_wTagline_Artboard 1.svg';
import EmailSettings from '../components/EmailSettings';

// --- Re-introduce specific types for fetched data ---

// Extend PromoItem if necessary or use it directly
interface WishlistItemDetails extends BasePromoItem {
  // Add specific fields if different from BasePromoItem
  available_quantity: number; // Add available_quantity from promo_items
}

// Type for the data structure from the wishlist_requests query (used within Edge Function)
/* // Not directly needed by component if Edge Function returns OrderWithDetails
interface WishlistRequestWithItem {
  id: string;
  user_email: string;
  item_id: string;
  requested_quantity: number;
  status: string;
  item: WishlistItemDetails | null;
}
*/

// Helper type for checkout items with joined item details
interface CheckoutWithItem extends Omit<BaseCheckout, 'item_id' | 'item'> {
  item: BasePromoItem | null;
}

// Type for the formatted associated wishlist items added to the order object
interface AssociatedWishlistItem {
  wishlist_request_id: string;
  item: WishlistItemDetails | null;
  quantity: number;
  isWishlistItem: boolean;
  status: 'pending' | 'fulfilled' | 'added_to_order' | string; // Add status from wishlist_requests
}

// Type for the combined order data returned by the Edge Function
interface OrderWithDetails extends Omit<BaseOrder, 'items'> {
  items: CheckoutWithItem[];
  associatedWishlistItems: AssociatedWishlistItem[];
  id: string;
  created_at: string;
  user_name: string;
  user_email: string;
  checkout_date: string | null;
  return_date: string | null;
  status: 'pending' | 'picked_up' | 'returned' | 'cancelled' | 'wishlist_only';
}
// --- End Type Definitions ---

interface EditingItem extends Omit<BasePromoItem, 'id' | 'created_at'> {
  id: number | null;
  created_at?: string;
  isNew?: boolean;
}

interface EditingOrderDates {
  orderId: string;
  currentPickupDate: Date | null;
  currentReturnDate: Date | null;
  status: OrderWithDetails['status']; // Use status from new type
}

function AdminDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'email-settings'>('orders');
  const [items, setItems] = useState<BasePromoItem[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingOrders, setProcessingOrders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const [isEditDatesModalOpen, setIsEditDatesModalOpen] = useState(false);
  const [editingOrderDates, setEditingOrderDates] = useState<EditingOrderDates | null>(null);
  const [newPickupDate, setNewPickupDate] = useState<string>('');
  const [newReturnDate, setNewReturnDate] = useState<string>('');

  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/');
      return;
    }

    if (activeTab === 'inventory') {
      fetchItems();
    } else if (activeTab === 'orders') {
      fetchOrders();
    } else if (activeTab === 'email-settings') {
      setLoading(false);
    }
  }, [activeTab, user, navigate]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('promo_items')
        .select('*')
        .order('name');

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching items:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    console.log("fetchOrders called"); // Log start
    try {
      setLoading(true);
      setError(null);

      // Invoke the Edge Function to get combined order and wishlist data
      console.log("Invoking get-orders-with-wishlists Edge Function...");
      const { data: combinedOrdersData, error: functionError } = await supabase.functions.invoke(
        'get-orders-with-wishlists',
        {
          // No body needed for this GET-like request, but options can be added if required
          // Example: method: 'POST', body: { someParam: 'value' }
        }
      );

      if (functionError) {
        console.error("Edge function invocation error:", functionError);
        // Try to parse potential error message from function response
        let message = functionError.message;
        try {
            const errorDetails = JSON.parse(functionError.context?.responseText || '{}');
            if(errorDetails.error) message = `Function Error: ${errorDetails.error}`;
        } catch(e) { /* Ignore parsing errors */ }
        throw new Error(message || "Failed to fetch data from Edge Function.");
      }

      if (!combinedOrdersData) {
         console.log("Edge function returned no data.");
         setOrders([]); // Set to empty array if function returns null/undefined
         throw new Error("Edge function returned no data.");
      }
      
      // Ensure the data is an array (Edge Function should return OrderWithDetails[])
      if (!Array.isArray(combinedOrdersData)) {
          console.error("Data from edge function is not an array:", combinedOrdersData);
          throw new Error("Received invalid data format from Edge Function.");
      }

      console.log("Successfully received data from Edge Function:", combinedOrdersData);



      // Set the state with the data received from the Edge Function
      setOrders(combinedOrdersData as OrderWithDetails[]); // Assert type after validation

    } catch (err: any) {
      console.error('Error in fetchOrders (invoking function):', err);
      setError(err.message || "An unexpected error occurred while fetching order data.");
      setOrders([]); // Clear orders on error
    } finally {
      setLoading(false);
      console.log("fetchOrders finished"); // Log end
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setUploadingImage(true);
      setError(null);

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;

      const { data, error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      if (editingItem) {
        setEditingItem({
          ...editingItem,
          image_url: publicUrl
        });
      }
    } catch (err: any) {
      console.error('Error uploading image:', err);
      setError(err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveItem = async (item: EditingItem) => {
    try {
      setSaving(true);
      setError(null);

      if (!item.name.trim()) {
        throw new Error('Name is required');
      }

      if (item.total_quantity < 0) {
        throw new Error('Total quantity cannot be negative');
      }

      if (item.available_quantity < 0) {
        throw new Error('Available quantity cannot be negative');
      }

      if (item.available_quantity > item.total_quantity) {
        throw new Error('Available quantity cannot be greater than total quantity');
      }

      const itemData = {
        name: item.name.trim(),
        description: item.description?.trim() || null,
        image_url: item.image_url?.trim() || null,
        total_quantity: item.total_quantity,
        available_quantity: item.isNew ? item.total_quantity : item.available_quantity,
        category: item.category || 'Misc'
      };

      let result;
      if (item.isNew) {
        result = await supabase
          .from('promo_items')
          .insert([itemData])
          .select()
          .single();
      } else {
        result = await supabase
          .from('promo_items')
          .update(itemData)
          .eq('id', item.id)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      setEditingItem(null);
      await fetchItems();
    } catch (err: any) {
      console.error('Error saving item:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      setError(null);
      
      const item = items.find(i => i.id === itemId);
      if (item?.image_url) {
        const imagePath = item.image_url.split('/').pop();
        if (imagePath) {
          await supabase.storage
            .from('photos')
            .remove([imagePath]);
        }
      }

      const { error: deleteError } = await supabase
        .from('promo_items')
        .delete()
        .eq('id', itemId);

      if (deleteError) throw deleteError;

      await fetchItems();
    } catch (err: any) {
      console.error('Error deleting item:', err);
      setError(err.message);
    }
  };

  const handleEditItem = (item: BasePromoItem) => {
    setEditingItem({
      ...item,
      isNew: false
    });
  };

  const updateOrderStatus = async (orderId: string, newStatus: OrderWithDetails['status']) => {
    const orderToNotify = orders.find(o => o.id === orderId);

    try {
      setProcessingOrders(prev => new Set([...prev, orderId]));
      setError(null);

      const { data: resultData, error: updateError } = await supabase.rpc(
        'update_order_status',
        {
          p_order_id: orderId,
          p_new_status: newStatus
        }
      );

      if (updateError) {
        console.error('RPC Error:', updateError);
        throw updateError;
      }

      if (resultData && resultData.success === false) {
        console.error('Function Logic Error:', resultData.message);
        throw new Error(resultData.message || 'Status update failed within the database function.');
      }

      if (orderToNotify) {
        try {
          const emailPayload = {
            orderId: orderToNotify.id,
            customerName: orderToNotify.user_name,
            customerEmail: orderToNotify.user_email,
            pickupDate: orderToNotify.checkout_date ? new Date(orderToNotify.checkout_date).toLocaleDateString() : 'N/A',
            returnDate: orderToNotify.return_date ? new Date(orderToNotify.return_date).toLocaleDateString() : 'N/A',
            items: orderToNotify.items.map(checkout => ({
              name: checkout.item?.name || 'Unknown Item',
              quantity: checkout.quantity
            })),
            newStatus: newStatus
          };

          let userNotificationFunction = '';
          switch (newStatus) {
            case 'picked_up':
              userNotificationFunction = 'send-pickup-confirmation';
              break;
            case 'returned':
              userNotificationFunction = 'send-return-confirmation';
              break;
            case 'cancelled':
              userNotificationFunction = 'send-cancel-confirmation';
              break;
            default:
              break;
          }

          if (userNotificationFunction) {
            const { error: userConfirmError } = await supabase.functions.invoke(userNotificationFunction, {
              body: emailPayload
            });
            if (userConfirmError) {
              console.error(`Error sending ${userNotificationFunction}:`, userConfirmError);
            }
          }
        } catch (emailError) {
           console.error('Failed to send email notifications:', emailError);
        }
      } else {
         console.warn(`Order details not found for ID ${orderId} to send status update email.`);
      }

      await fetchOrders();
      await fetchItems();
    } catch (err: any) {
      console.error('Error updating order status:', err);
      setError(err.message || 'An unexpected error occurred during status update.');
    } finally {
      setProcessingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const getAvailableStatuses = (currentStatus: OrderWithDetails['status']): OrderWithDetails['status'][] => {
    switch (currentStatus) {
      case 'pending':
        return ['pending', 'picked_up', 'cancelled'];
      case 'picked_up':
        return ['picked_up', 'returned'];
      case 'returned':
        return ['returned'];
      case 'cancelled':
        return ['cancelled'];
      case 'wishlist_only':
        return ['wishlist_only', 'cancelled'];
      default:
        return [];
    }
  };

  const handleOpenEditDatesModal = (order: OrderWithDetails) => {
    const pickupDate = order.checkout_date ? parseISO(order.checkout_date) : null;
    const returnDate = order.return_date ? parseISO(order.return_date) : null;
    const validPickupDate = isValid(pickupDate) ? pickupDate : null;
    const validReturnDate = isValid(returnDate) ? returnDate : null;

    setEditingOrderDates({
      orderId: order.id,
      currentPickupDate: validPickupDate,
      currentReturnDate: validReturnDate,
      status: order.status
    });
    setNewPickupDate(validPickupDate ? format(validPickupDate, 'yyyy-MM-dd') : '');
    setNewReturnDate(validReturnDate ? format(validReturnDate, 'yyyy-MM-dd') : '');
    setIsEditDatesModalOpen(true);
  };

  const handleSaveOrderDates = async (newPickupDateString: string, newReturnDateString: string) => {
    if (!editingOrderDates) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const pickupDateObj = newPickupDateString ? parse(newPickupDateString, 'yyyy-MM-dd', new Date()) : null;
    const returnDateObj = newReturnDateString ? parse(newReturnDateString, 'yyyy-MM-dd', new Date()) : null;

    if (!newReturnDateString || !returnDateObj || !isValid(returnDateObj)) {
      setError('Invalid return date selected.');
      return;
    }
    if (editingOrderDates.status === 'pending') {
      if (!newPickupDateString || !pickupDateObj || !isValid(pickupDateObj)) {
        setError('Invalid pickup date selected.');
        return;
      }
    }
    if (pickupDateObj && isValid(pickupDateObj) && returnDateObj && returnDateObj < pickupDateObj) {
      setError('Return date cannot be before pickup date.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updateData: Partial<OrderWithDetails> = {};
      const currentPickupISO = editingOrderDates.currentPickupDate?.toISOString().split('T')[0];
      const currentReturnISO = editingOrderDates.currentReturnDate?.toISOString().split('T')[0];

      if (editingOrderDates.status === 'pending' && newPickupDateString && newPickupDateString !== currentPickupISO) {
        updateData.checkout_date = newPickupDateString;
      }

      if (newReturnDateString && newReturnDateString !== currentReturnISO) {
        updateData.return_date = newReturnDateString;
      }

      if (Object.keys(updateData).length === 0) {
        console.log('No date changes detected.');
        setIsEditDatesModalOpen(false);
        setEditingOrderDates(null);
        setSaving(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', editingOrderDates.orderId);

      if (updateError) throw updateError;

      setIsEditDatesModalOpen(false);
      setEditingOrderDates(null);
      await fetchOrders();
      console.log('Order dates updated successfully');

    } catch (err: any) {
      console.error('Error updating order dates:', err);
      setError(err.message || 'Failed to update order dates');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectOrder = (orderId: string, isSelected: boolean) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (isSelected) {
        next.add(orderId);
      } else {
        next.delete(orderId);
      }
      return next;
    });
  };

  const handleSelectAllOrders = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedOrderIds(new Set(orders.map(o => o.id)));
    } else {
      setSelectedOrderIds(new Set());
    }
  };

  const handleDeleteSelectedOrders = async () => {
    if (selectedOrderIds.size === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${selectedOrderIds.size} selected order(s)? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('orders')
        .delete()
        .in('id', Array.from(selectedOrderIds));

      if (deleteError) throw deleteError;

      setSelectedOrderIds(new Set());
      await fetchOrders();
      console.log(`${selectedOrderIds.size} orders deleted successfully.`);

    } catch (err: any) {
      console.error('Error deleting orders:', err);
      setError(err.message || 'Failed to delete selected orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleFulfillWishlistItem = async (
    wishlistRequestId: string,
    orderId: string,
    userEmail: string,
    userName: string,
    itemName: string,
    itemQuantity: number
  ) => {
    if (!window.confirm(`Add "${itemName}" (x${itemQuantity}) to order ${orderId} for ${userName}? This cannot be undone.`)) {
      return;
    }

    setProcessingOrders(prev => new Set([...prev, orderId]));
    setError(null);

    try {
      // First, check if the order is wishlist_only and update it to pending
      const order = orders.find(o => o.id === orderId);
      if (order?.status === 'wishlist_only') {
        console.log('Converting wishlist_only order to pending...');
        const { error: statusError } = await supabase
          .from('orders')
          .update({ status: 'pending' })
          .eq('id', orderId);
        
        if (statusError) {
          console.error('Error updating order status:', statusError);
          throw new Error(`Failed to update order status: ${statusError.message}`);
        }
      }

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'fulfill_wishlist_item',
        {
          p_wishlist_request_id: parseInt(wishlistRequestId, 10),
          p_target_order_id: orderId
        }
      );

      if (rpcError) {
        console.error('RPC Error fulfilling wishlist:', rpcError);
        throw new Error(`Database error: ${rpcError.message}`);
      }

      if (!rpcData || rpcData.success === false) {
        console.error('RPC Logic Error fulfilling wishlist:', rpcData?.message);
        throw new Error(rpcData?.message || 'Failed to fulfill wishlist item in database.');
      }

      console.log('Wishlist item fulfilled successfully via RPC. Sending notification...');
      try {
         const emailPayload = {
           userEmail: userEmail,
           userName: userName,
           itemName: itemName,
           requestedQuantity: itemQuantity,
           orderId: orderId,
           requestedPickupDate: order?.checkout_date || 'N/A',
           requestedReturnDate: order?.return_date || 'N/A'
         };

         const { error: emailError } = await supabase.functions.invoke(
            'send-wishlist-available-notification',
            { body: emailPayload }
         );

         if (emailError) {
             console.error('Error sending wishlist fulfillment notification:', emailError);
         } else {
             console.log('Wishlist fulfillment notification sent.');
         }
      } catch (emailInvokeError) {
           console.error('Error invoking email function:', emailInvokeError);
      }

      await fetchOrders();

    } catch (err: any) {
      console.error('Error in handleFulfillWishlistItem:', err);
      setError(err.message || 'An unexpected error occurred during fulfillment.');
    } finally {
      setProcessingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  if (!user?.is_admin) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // --- DEBUG LOG --- 
  console.log('[AdminDashboard Render]', { 
    activeTab, 
    loading, 
    error, 
    items, // Log the items state directly
    isItemsArray: Array.isArray(items) // Explicitly check if it's an array
  });
  // --- END DEBUG LOG ---

  // --- ADD DEBUG LOG FOR ORDERS STATE --- 
  console.log('[AdminDashboard Render] Final orders state before render:', orders);
  // --- END DEBUG LOG --- 

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-64 bg-gradient-to-b from-[#003656] to-[#0075AE] text-white flex flex-col flex-shrink-0 shadow-lg">
        <div className="p-6 flex items-center justify-center">
          <img src={vellumLogoWhite} alt="Vellum Logo" className="h-12 w-auto" />
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <button
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'orders' ? 'bg-white/20' : 'hover:bg-white/10'}`}
          >
            <ShoppingBag className="h-5 w-5" />
            Orders
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'inventory' ? 'bg-white/20' : 'hover:bg-white/10'}`}
          >
            <Package2 className="h-5 w-5" />
            Inventory
          </button>
          <button
            onClick={() => setActiveTab('email-settings')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'email-settings' ? 'bg-white/20' : 'hover:bg-white/10'}`}
          >
            <Mail className="h-5 w-5" />
            Email Settings
          </button>
        </nav>
        <div className="p-4 border-t border-white/20 flex-shrink-0">
          <Link 
            to="/"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 transition-colors mb-3"
          >
            <LayoutDashboard className="h-5 w-5" />
            View Store
          </Link>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-transparent border border-white hover:bg-white/10 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </div>

      <main className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#58595B]">
              {activeTab === 'orders' ? 'Orders' : 
               activeTab === 'inventory' ? 'Inventory' : 
               'Email Settings'}
            </h1>
            <p className="text-gray-500 mt-1">
              {activeTab === 'orders' ? 'Manage and track customer orders' : 
               activeTab === 'inventory' ? 'Manage your inventory items' :
               'Configure automated email templates and recipients'}
            </p>
          </div>

          {activeTab === 'inventory' && (
            <button
              onClick={() => setEditingItem({
                id: null,
                name: '',
                description: '',
                image_url: '',
                total_quantity: 0,
                available_quantity: 0,
                category: 'Misc',
                isNew: true
              })}
              className="flex items-center px-4 py-2 bg-[#2c3e50] text-white rounded-lg hover:bg-[#34495e] transition-colors"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add New Item
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {activeTab === 'orders' ? (
          <div className="space-y-6">
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading orders...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-600">{error}</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No orders found.</div>
            ) : (
              <>
                <div className="mb-4">
                  <button
                    onClick={handleDeleteSelectedOrders}
                    disabled={selectedOrderIds.size === 0}
                    className="px-4 py-2 border border-gray-400 text-gray-600 rounded-lg hover:bg-gray-100 disabled:border-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:opacity-75 flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Selected ({selectedOrderIds.size})
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={selectedOrderIds.size === orders.length && orders.length > 0}
                            onChange={(e) => handleSelectAllOrders(e.target.checked)}
                          />
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dates</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {!loading && !error && Array.isArray(orders) && orders.length > 0 ? (
                        orders.map((order) => (
                          <tr key={order.id} className="border-b hover:bg-gray-50 text-sm text-gray-700">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input 
                                type="checkbox" 
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={selectedOrderIds.has(order.id)}
                                onChange={(e) => handleSelectOrder(order.id, e.target.checked)}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-[#58595B]">{order.user_name}</div>
                              <div className="text-sm text-gray-500">{order.user_email}</div>
                            </td>
                            {/* Items Column - Combined checked out and wishlist items */}
                            <td className="px-6 py-4">
                              <div className="space-y-3">
                                {/* Checked Out Items Section */}
                                {Array.isArray(order.items) && order.items.length > 0 && (
                                  <div>
                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Checked Out</div>
                                    {order.items.map(checkoutItem => (
                                      <div key={`checkout-${checkoutItem.id}`} className="flex items-center space-x-2 mb-1 last:mb-0 bg-green-50 p-2 rounded border border-green-200">
                                        <img src={checkoutItem.item?.image_url || 'https://placehold.co/40x40/png'} alt={checkoutItem.item?.name ?? 'Item'} className="w-6 h-6 rounded object-cover flex-shrink-0"/>
                                        <div className="flex-grow min-w-0">
                                          <div className="text-sm font-medium text-green-800 truncate" title={checkoutItem.item?.description || checkoutItem.item?.name || ''}>
                                            {checkoutItem.item?.name ?? 'Unknown Item'}
                                          </div>
                                          <div className="text-xs text-green-600">
                                            Quantity: {checkoutItem.quantity}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Wishlist Items Section */}
                                {Array.isArray(order.associatedWishlistItems) && order.associatedWishlistItems.filter(item => item.status === 'pending').length > 0 && (
                                  <div>
                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Wishlist</div>
                                    {order.associatedWishlistItems
                                      .filter((wishlistItem) => wishlistItem.status === 'pending')
                                      .map((wishlistItem) => {
                                        const effectiveQuantity = Math.min(wishlistItem.quantity, wishlistItem.item?.available_quantity || 0);
                                        const canFulfill = (order.status === 'pending' || order.status === 'wishlist_only') && wishlistItem.status === 'pending' && wishlistItem.item && wishlistItem.item.available_quantity >= effectiveQuantity && effectiveQuantity > 0;
                                        return (
                                          <div 
                                            key={`wishlist-${wishlistItem.wishlist_request_id}`} 
                                            className="flex items-center justify-between space-x-2 mb-1 last:mb-0 bg-orange-50 p-2 rounded border border-orange-200"
                                          >
                                            {/* Left side: Image and Text */}
                                            <div className="flex items-center space-x-2 flex-grow min-w-0">
                                              <img 
                                                src={wishlistItem.item?.image_url || 'https://placehold.co/40x40/png'} 
                                                alt={wishlistItem.item?.name ?? 'Wishlist item'} 
                                                className="w-6 h-6 rounded object-cover flex-shrink-0" 
                                              />
                                              <div className="flex-grow min-w-0">
                                                                                            <div className="text-sm font-medium text-orange-800 truncate" title={wishlistItem.item?.description || wishlistItem.item?.name || ''}>
                                              {wishlistItem.item?.name ?? 'Unknown Item'} 
                                            </div>
                                            <div className="text-xs text-orange-600">
                                              Requested: {wishlistItem.quantity} • Available: {wishlistItem.item?.available_quantity || 0}
                                            </div>
                                              </div>
                                            </div>
                                            
                                            {/* Right side: Fulfill Button (Conditional) */}
                                            {canFulfill && (
                                              <button
                                                                                            onClick={() => handleFulfillWishlistItem(
                                              wishlistItem.wishlist_request_id,
                                              order.id,
                                              order.user_email, 
                                              order.user_name,
                                              wishlistItem.item?.name ?? 'Unknown Item',
                                              effectiveQuantity
                                            )}
                                                disabled={processingOrders.has(order.id)} // Disable if order is processing
                                                className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                {processingOrders.has(order.id) ? '...' : 'Fulfill'}
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                )}
                                
                                {/* Show message if no items at all */}
                                {(() => {
                                  const hasCheckedOutItems = Array.isArray(order.items) && order.items.length > 0;
                                  const hasWishlistItems = Array.isArray(order.associatedWishlistItems) && order.associatedWishlistItems.length > 0;
                                  

                                  
                                  return !hasCheckedOutItems && !hasWishlistItems;
                                })() && (
                                  <div className="text-sm text-gray-500 italic">No items</div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-[#58595B]">
                                Pickup: {order.checkout_date ? format(parseISO(order.checkout_date), 'MM/dd/yyyy') : 'N/A'}
                              </div>
                              <div className="text-sm text-gray-500">
                                Return: {order.return_date ? format(parseISO(order.return_date), 'MM/dd/yyyy') : 'N/A'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <StatusDropdown
                                status={order.status}
                                orderId={order.id}
                                onStatusChange={updateOrderStatus}
                                disabled={processingOrders.has(order.id)}
                                availableStatuses={getAvailableStatuses(order.status)}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={() => handleOpenEditDatesModal(order)}
                                disabled={order.status === 'returned' || order.status === 'cancelled'}
                                className={`p-1 rounded hover:bg-gray-100 ${order.status === 'returned' || order.status === 'cancelled' ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}`}
                                title="Edit Dates"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                            {!loading && !error ? 'No orders found.' : ''}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : activeTab === 'inventory' ? (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <div className="p-6 text-center text-gray-400">No inventory items found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 table-auto">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Qty</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available Qty</th>
                        <th className="px-4 py-3 w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {items.map(item => (
                        <tr key={item.id}>
                          <td className="px-4 py-4">
                            <img src={item.image_url || 'https://placehold.co/40x40/png'} alt={item.name} className="w-10 h-10 rounded object-cover" />
                          </td>
                          <td className="px-4 py-4">{item.name}</td>
                          <td className="px-4 py-4 break-words max-w-xs">{item.description}</td>
                          <td className="px-4 py-4">{item.total_quantity}</td>
                          <td className="px-4 py-4">{item.available_quantity}</td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => handleEditItem(item)}
                              className="text-blue-600 hover:text-blue-900 mr-2"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4 inline" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmailSettings />
        )}

        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl relative max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-[#58595B]">
                  {editingItem.isNew ? 'Add New Item' : 'Edit Item'}
                </h2>
                <button
                  onClick={() => setEditingItem(null)}
                  disabled={saving || uploadingImage}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-[#58595B]">Name</label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#2c3e50] focus:ring-[#2c3e50]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#58595B]">Description</label>
                  <textarea
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#2c3e50] focus:ring-[#2c3e50]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#58595B]">Category</label>
                  <select
                    value={editingItem.category || 'Misc'}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as any })}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#2c3e50] focus:ring-[#2c3e50]"
                  >
                    <option value="Tents">Tents</option>
                    <option value="Tables">Tables</option>
                    <option value="Linens">Linens</option>
                    <option value="Displays">Displays</option>
                    <option value="Decor">Decor</option>
                    <option value="Games">Games</option>
                    <option value="Misc">Miscellaneous</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#58595B] mb-2">Image</label>
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 h-24 w-24 rounded-lg overflow-hidden bg-gray-100">
                      {editingItem.image_url ? (
                        <img
                          src={editingItem.image_url}
                          alt={editingItem.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Package2 className="h-12 w-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="relative cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleImageUpload(file);
                            }
                          }}
                        />
                        <div className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-[#58595B] bg-white hover:bg-gray-50">
                          <Upload className="h-5 w-5 mr-2" />
                          {uploadingImage ? 'Uploading...' : 'Upload Image'}
                        </div>
                      </label>
                      <p className="mt-1 text-xs text-gray-500">
                        Click to upload a new image. Maximum file size: 5MB.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#58595B]">Total Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={editingItem.total_quantity}
                      onChange={(e) => {
                        const newTotal = parseInt(e.target.value);
                        setEditingItem({ 
                          ...editingItem, 
                          total_quantity: newTotal,
                          available_quantity: editingItem.isNew ? newTotal : editingItem.available_quantity
                        });
                      }}
                      className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#2c3e50] focus:ring-[#2c3e50]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#58595B]">Available Quantity</label>
                    <input
                      type="number"
                      min="0"
                      max={editingItem.total_quantity}
                      value={editingItem.available_quantity}
                      onChange={(e) => setEditingItem({ ...editingItem, available_quantity: Number(e.target.value) || 0 })}
                      disabled={editingItem.isNew}
                      className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#2c3e50] focus:ring-[#2c3e50] disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setEditingItem(null)}
                  disabled={saving || uploadingImage}
                  className="px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveItem(editingItem)}
                  disabled={saving || uploadingImage}
                  className="px-4 py-2 bg-[#2c3e50] text-white rounded-lg shadow-sm text-sm font-medium hover:bg-[#34495e] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : (editingItem.isNew ? 'Add Item' : 'Save Changes')}
                </button>
              </div>
            </div>
          </div>
        )}

        {isEditDatesModalOpen && editingOrderDates && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md relative">
              <h3 className="text-lg font-medium leading-6 text-[#58595B] mb-4">Edit Order Dates</h3>
              <p className="text-sm text-gray-600 mb-2">Order ID: {editingOrderDates.orderId}</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#58595B] mb-1">Pickup Date</label>
                  <input
                    type="date"
                    value={newPickupDate}
                    onChange={(e) => setNewPickupDate(e.target.value)}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    disabled={editingOrderDates.status !== 'pending'}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm ${editingOrderDates.status !== 'pending' ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'}`}
                  />
                  <p className="text-xs text-gray-500 mt-1">Current: {editingOrderDates.currentPickupDate ? format(editingOrderDates.currentPickupDate, 'MM/dd/yyyy') : 'N/A'}</p>
                  {editingOrderDates.status !== 'pending' && (
                    <p className="text-xs text-orange-500 mt-1">Cannot change pickup date after pickup.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#58595B] mb-1">Return Date</label>
                  <input
                    type="date"
                    value={newReturnDate}
                    onChange={(e) => setNewReturnDate(e.target.value)}
                    min={newPickupDate || format(new Date(), 'yyyy-MM-dd')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Current: {editingOrderDates.currentReturnDate ? format(editingOrderDates.currentReturnDate, 'MM/dd/yyyy') : 'N/A'}</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsEditDatesModalOpen(false); setEditingOrderDates(null); }}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveOrderDates(newPickupDate, newReturnDate)}
                  disabled={saving}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminDashboard;