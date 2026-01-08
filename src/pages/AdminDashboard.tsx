import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ShoppingBag, Package2, Mail, LogOut, LayoutDashboard } from 'lucide-react';
import { parseISO, isValid } from 'date-fns';
import type { PromoItem as BasePromoItem } from '../types';
import { useAuth } from '../context/AuthContext';
import vellumLogoWhite from '../Logo_Horizontal_White_wTagline_Artboard 1.svg';
import EmailSettings from '../components/EmailSettings';
import OrdersView from '../components/orders/OrdersView';
import type { OrderWithDetails } from '../components/orders/OrderCard';
import InventoryTable from '../components/inventory/InventoryTable';
import EditItemModal, { type EditingItem } from '../components/inventory/EditItemModal';
import EditDatesModal from '../components/inventory/EditDatesModal';

interface EditingOrderDates {
  orderId: string;
  currentPickupDate: Date | null;
  currentReturnDate: Date | null;
  status: OrderWithDetails['status'];
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

  const [isEditDatesModalOpen, setIsEditDatesModalOpen] = useState(false);
  const [editingOrderDates, setEditingOrderDates] = useState<EditingOrderDates | null>(null);

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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: combinedOrdersData, error: functionError } = await supabase.functions.invoke(
        'get-orders-with-wishlists'
      );

      if (functionError) {
        let message = functionError.message;
        try {
          const errorDetails = JSON.parse(functionError.context?.responseText || '{}');
          if (errorDetails.error) message = `Function Error: ${errorDetails.error}`;
        } catch {
          // Ignore parsing errors
        }
        throw new Error(message || "Failed to fetch orders.");
      }

      if (!combinedOrdersData) {
        setOrders([]);
        return;
      }
      
      if (!Array.isArray(combinedOrdersData)) {
        throw new Error("Received invalid data format.");
      }

      setOrders(combinedOrdersData as OrderWithDetails[]);

    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while fetching orders.");
      setOrders([]);
    } finally {
      setLoading(false);
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
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
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
        throw updateError;
      }

      if (resultData && resultData.success === false) {
        throw new Error(resultData.message || 'Status update failed.');
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
            await supabase.functions.invoke(userNotificationFunction, {
              body: emailPayload
            });
          }
        } catch {
          // Email notification failed silently
        }
      }

      await fetchOrders();
      await fetchItems();
    } catch (err: any) {
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
    setIsEditDatesModalOpen(true);
  };

  const handleSaveOrderDates = async (newPickupDateString: string, newReturnDateString: string) => {
    if (!editingOrderDates) return;

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

    } catch (err: any) {
      setError(err.message || 'Failed to update order dates');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrders = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('orders')
        .delete()
        .in('id', orderIds);

      if (deleteError) throw deleteError;
      await fetchOrders();
    } catch (err: any) {
      setError(err.message || 'Failed to delete orders.');
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
      // Convert wishlist_only order to pending if needed
      const order = orders.find(o => o.id === orderId);
      if (order?.status === 'wishlist_only') {
        const { error: statusError } = await supabase
          .from('orders')
          .update({ status: 'pending' })
          .eq('id', orderId);
        
        if (statusError) {
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
        throw new Error(`Database error: ${rpcError.message}`);
      }

      if (!rpcData || rpcData.success === false) {
        throw new Error(rpcData?.message || 'Failed to fulfill wishlist item.');
      }

      // Send notification
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

        await supabase.functions.invoke(
          'send-wishlist-available-notification',
          { body: emailPayload }
        );
      } catch {
        // Email notification failed silently
      }

      await fetchOrders();

    } catch (err: any) {
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
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

        {error && activeTab !== 'orders' && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {activeTab === 'orders' ? (
          <OrdersView
            orders={orders}
            loading={loading}
            error={error}
            onRefresh={fetchOrders}
            onStatusChange={updateOrderStatus}
            onEditDates={handleOpenEditDatesModal}
            onDeleteSelected={handleDeleteOrders}
            onFulfillWishlist={handleFulfillWishlistItem}
            processingOrders={processingOrders}
            getAvailableStatuses={getAvailableStatuses}
          />
        ) : activeTab === 'inventory' ? (
          <InventoryTable
            items={items}
            loading={loading}
            onAddNew={() => setEditingItem({
              id: null,
              name: '',
              description: '',
              image_url: '',
              total_quantity: 0,
              available_quantity: 0,
              category: 'Misc',
              isNew: true
            })}
            onEdit={handleEditItem}
            onDelete={handleDeleteItem}
          />
        ) : (
          <EmailSettings />
        )}

        {editingItem && (
          <EditItemModal
            item={editingItem}
            onClose={() => setEditingItem(null)}
            onSave={handleSaveItem}
            onImageUpload={handleImageUpload}
            saving={saving}
            uploadingImage={uploadingImage}
          />
        )}

        {isEditDatesModalOpen && editingOrderDates && (
          <EditDatesModal
            orderDates={editingOrderDates}
            onClose={() => { setIsEditDatesModalOpen(false); setEditingOrderDates(null); }}
            onSave={handleSaveOrderDates}
            saving={saving}
          />
        )}
      </main>
    </div>
  );
}

export default AdminDashboard;