import React, { useEffect, useState, useCallback } from 'react';
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

const PAGE_SIZE = 50;

interface EditingOrderDates {
  orderId: string;
  currentPickupDate: Date | null;
  currentReturnDate: Date | null;
  status: OrderWithDetails['status'];
}

function AdminDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'email-settings'>('orders');
  const [items, setItems] = useState<BasePromoItem[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingOrders, setProcessingOrders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [isEditDatesModalOpen, setIsEditDatesModalOpen] = useState(false);
  const [editingOrderDates, setEditingOrderDates] = useState<EditingOrderDates | null>(null);

  const fetchOrders = useCallback(
    async (page = currentPage, filter = statusFilter) => {
      try {
        setLoading(true);
        setError(null);

        const offset = (page - 1) * PAGE_SIZE;
        const params: Record<string, string> = {
          limit:  String(PAGE_SIZE),
          offset: String(offset),
        };
        if (filter) params.status = filter;

        // Build query string for the edge function URL
        const qs = new URLSearchParams(params).toString();
        const { data: responseData, error: functionError } = await supabase.functions.invoke(
          `get-orders-with-wishlists?${qs}`,
        );

        if (functionError) {
          let message = functionError.message;
          try {
            const errorDetails = JSON.parse(functionError.context?.responseText || '{}');
            if (errorDetails.error) message = `Function Error: ${errorDetails.error}`;
          } catch {
            // ignore
          }
          throw new Error(message || 'Failed to fetch orders.');
        }

        if (!responseData) {
          setOrders([]);
          setTotalOrderCount(0);
          return;
        }

        // Support both paginated { orders, total_count } and legacy array shape
        if (Array.isArray(responseData)) {
          setOrders(responseData as OrderWithDetails[]);
          setTotalOrderCount(responseData.length);
        } else {
          const { orders: ordersData, total_count } = responseData as {
            orders: OrderWithDetails[];
            total_count: number;
          };
          setOrders(ordersData || []);
          setTotalOrderCount(total_count ?? 0);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        setError(message);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    },
    [currentPage, statusFilter],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user?.is_admin) { navigate('/login'); return; }

    if (activeTab === 'inventory') {
      fetchItems();
    } else if (activeTab === 'orders') {
      fetchOrders(currentPage, statusFilter);
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user, authLoading, navigate]);

  const handleStatusFilterChange = (newFilter: string) => {
    setStatusFilter(newFilter);
    setCurrentPage(1);
    fetchOrders(1, newFilter);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    fetchOrders(newPage, statusFilter);
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.from('promo_items').select('*').order('name');
      if (error) throw error;
      setItems(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
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
      const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName);
      if (editingItem) setEditingItem({ ...editingItem, image_url: publicUrl });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveItem = async (item: EditingItem) => {
    try {
      setSaving(true);
      setError(null);
      if (!item.name.trim()) throw new Error('Name is required');
      if (item.total_quantity < 0) throw new Error('Total quantity cannot be negative');
      if (item.available_quantity < 0) throw new Error('Available quantity cannot be negative');
      if (item.available_quantity > item.total_quantity)
        throw new Error('Available quantity cannot be greater than total quantity');

      const itemData = {
        name:               item.name.trim(),
        description:        item.description?.trim() || null,
        image_url:          item.image_url?.trim() || null,
        total_quantity:     item.total_quantity,
        available_quantity: item.isNew ? item.total_quantity : item.available_quantity,
        category:           item.category || 'Misc',
      };

      const result = item.isNew
        ? await supabase.from('promo_items').insert([itemData]).select().single()
        : await supabase.from('promo_items').update(itemData).eq('id', item.id).select().single();

      if (result.error) throw result.error;
      setEditingItem(null);
      await fetchItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      setError(null);
      const item = items.find((i) => i.id === itemId);
      if (item?.image_url) {
        const imagePath = item.image_url.split('/').pop();
        if (imagePath) await supabase.storage.from('photos').remove([imagePath]);
      }
      const { error: deleteError } = await supabase.from('promo_items').delete().eq('id', itemId);
      if (deleteError) throw deleteError;
      await fetchItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleEditItem = (item: BasePromoItem) => {
    setEditingItem({ ...item, isNew: false });
  };

  // ----------------------------------------------------------------
  // Order status change (used by StatusDropdown + Confirm Pickup/Return buttons)
  // ----------------------------------------------------------------
  const updateOrderStatus = async (orderId: string, newStatus: OrderWithDetails['status']) => {
    const orderToNotify = orders.find((o) => o.id === orderId);
    try {
      setProcessingOrders((prev) => new Set([...prev, orderId]));
      setError(null);

      const { data: resultData, error: updateError } = await supabase.rpc('update_order_status', {
        p_order_id:   orderId,
        p_new_status: newStatus,
      });

      if (updateError) throw updateError;
      if (resultData && resultData.success === false) {
        throw new Error(resultData.message || 'Status update failed.');
      }

      // Send email notification
      if (orderToNotify) {
        try {
          const emailPayload = {
            orderId:       orderToNotify.order_number || orderToNotify.id,
            customerName:  orderToNotify.user_name,
            customerEmail: orderToNotify.user_email,
            pickupDate:    orderToNotify.checkout_date
              ? new Date(orderToNotify.checkout_date).toLocaleDateString()
              : 'N/A',
            returnDate: orderToNotify.return_date
              ? new Date(orderToNotify.return_date).toLocaleDateString()
              : 'N/A',
            items: orderToNotify.items.map((c) => ({
              name:     c.item?.name || 'Unknown Item',
              quantity: c.quantity,
            })),
            newStatus,
          };

          const fnMap: Partial<Record<OrderWithDetails['status'], string>> = {
            picked_up: 'send-pickup-confirmation',
            returned:  'send-return-confirmation',
            cancelled: 'send-cancel-confirmation',
          };
          const fn = fnMap[newStatus];
          if (fn) await supabase.functions.invoke(fn, { body: emailPayload });
        } catch {
          // email failure is non-fatal
        }
      }

      await fetchOrders(currentPage, statusFilter);
      await fetchItems();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred during status update.',
      );
    } finally {
      setProcessingOrders((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // ----------------------------------------------------------------
  // Reject order
  // ----------------------------------------------------------------
  const handleRejectOrder = async (orderId: string, reason: string) => {
    const orderToNotify = orders.find((o) => o.id === orderId);
    try {
      setProcessingOrders((prev) => new Set([...prev, orderId]));
      setError(null);

      const { data, error: rpcError } = await supabase.rpc('reject_order', {
        p_order_id: orderId,
        p_reason:   reason,
      });
      if (rpcError) throw rpcError;
      if (data && data.success === false) throw new Error(data.message || 'Rejection failed.');

      // Send rejection email
      if (orderToNotify) {
        try {
          await supabase.functions.invoke('send-rejection-confirmation', {
            body: {
              orderId:         orderToNotify.order_number || orderToNotify.id,
              customerName:    orderToNotify.user_name,
              customerEmail:   orderToNotify.user_email,
              rejectionReason: reason,
            },
          });
        } catch {
          // email failure is non-fatal
        }
      }

      await fetchOrders(currentPage, statusFilter);
      await fetchItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reject order.');
    } finally {
      setProcessingOrders((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // ----------------------------------------------------------------
  // Process partial return
  // ----------------------------------------------------------------
  const handleProcessReturn = async (
    orderId: string,
    lines: { checkoutId: string; returnedQty: number; damagedQty: number; notes: string }[],
  ) => {
    try {
      setProcessingOrders((prev) => new Set([...prev, orderId]));
      setError(null);

      for (const line of lines) {
        const { data, error: rpcError } = await supabase.rpc('process_partial_return', {
          p_checkout_id:  line.checkoutId,
          p_returned_qty: line.returnedQty,
          p_damaged_qty:  line.damagedQty,
          p_notes:        line.notes || null,
        });
        if (rpcError) throw rpcError;
        if (data && data.success === false) {
          throw new Error(data.message || 'Return processing failed.');
        }
      }

      await fetchOrders(currentPage, statusFilter);
      await fetchItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process return.');
    } finally {
      setProcessingOrders((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const getAvailableStatuses = (
    currentStatus: OrderWithDetails['status'],
  ): OrderWithDetails['status'][] => {
    switch (currentStatus) {
      case 'pending':       return ['pending', 'picked_up', 'cancelled'];
      case 'picked_up':     return ['picked_up', 'returned'];
      case 'returned':      return ['returned'];
      case 'cancelled':     return ['cancelled'];
      case 'rejected':      return ['rejected'];
      case 'wishlist_only': return ['wishlist_only', 'cancelled'];
      default:              return [];
    }
  };

  const handleOpenEditDatesModal = (order: OrderWithDetails) => {
    const pickupDate  = order.checkout_date ? parseISO(order.checkout_date) : null;
    const returnDate  = order.return_date    ? parseISO(order.return_date)   : null;
    const validPickup = isValid(pickupDate) ? pickupDate : null;
    const validReturn = isValid(returnDate) ? returnDate : null;
    setEditingOrderDates({
      orderId:            order.id,
      currentPickupDate:  validPickup,
      currentReturnDate:  validReturn,
      status:             order.status,
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
      await fetchOrders(currentPage, statusFilter);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update order dates');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrders = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: deleteError } = await supabase.rpc('delete_orders_with_restore', {
        p_order_ids: orderIds,
      });
      if (deleteError) throw deleteError;
      if (data && data.success === false) throw new Error(data.message);
      await fetchOrders(currentPage, statusFilter);
      await fetchItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete orders.');
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
    itemQuantity: number,
  ) => {
    if (
      !window.confirm(
        `Add "${itemName}" (x${itemQuantity}) to order ${orderId} for ${userName}? This cannot be undone.`,
      )
    ) return;

    setProcessingOrders((prev) => new Set([...prev, orderId]));
    setError(null);

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('fulfill_wishlist_item', {
        p_wishlist_request_id: parseInt(wishlistRequestId, 10),
        p_target_order_id:     orderId,
      });
      if (rpcError) throw new Error(`Database error: ${rpcError.message}`);
      if (!rpcData || rpcData.success === false) {
        throw new Error(rpcData?.message || 'Failed to fulfill wishlist item.');
      }

      try {
        const matchedOrder = orders.find((o) => o.id === orderId);
        await supabase.functions.invoke('send-wishlist-available-notification', {
          body: {
            userEmail,
            userName,
            itemName,
            requestedQuantity:   itemQuantity,
            orderId,
            orderNumber:         matchedOrder?.order_number || orderId,
            requestedPickupDate: matchedOrder?.checkout_date || 'N/A',
            requestedReturnDate: matchedOrder?.return_date   || 'N/A',
          },
        });
      } catch {
        // non-fatal
      }

      await fetchOrders(currentPage, statusFilter);
      await fetchItems();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during fulfillment.');
    } finally {
      setProcessingOrders((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  if (authLoading || !user?.is_admin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
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

      {/* Main */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {activeTab === 'orders'
              ? 'Orders'
              : activeTab === 'inventory'
              ? 'Inventory'
              : 'Email Settings'}
          </h1>
          <p className="text-gray-500 mt-1">
            {activeTab === 'orders'
              ? 'Manage and track customer orders'
              : activeTab === 'inventory'
              ? 'Manage your inventory items'
              : 'Configure automated email templates and recipients'}
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
            totalCount={totalOrderCount}
            currentPage={currentPage}
            pageSize={PAGE_SIZE}
            statusFilter={statusFilter}
            onRefresh={() => fetchOrders(currentPage, statusFilter)}
            onStatusChange={updateOrderStatus}
            onEditDates={handleOpenEditDatesModal}
            onDeleteSelected={handleDeleteOrders}
            onFulfillWishlist={handleFulfillWishlistItem}
            onRejectOrder={handleRejectOrder}
            onProcessReturn={handleProcessReturn}
            onPageChange={handlePageChange}
            onStatusFilterChange={handleStatusFilterChange}
            processingOrders={processingOrders}
            getAvailableStatuses={getAvailableStatuses}
          />
        ) : activeTab === 'inventory' ? (
          <InventoryTable
            items={items}
            loading={loading}
            onAddNew={() =>
              setEditingItem({
                id:                 null,
                name:               '',
                description:        '',
                image_url:          '',
                total_quantity:     0,
                available_quantity: 0,
                category:           'Misc',
                isNew:              true,
              })
            }
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
            onClose={() => {
              setIsEditDatesModalOpen(false);
              setEditingOrderDates(null);
            }}
            onSave={handleSaveOrderDates}
            saving={saving}
          />
        )}
      </main>
    </div>
  );
}

export default AdminDashboard;
