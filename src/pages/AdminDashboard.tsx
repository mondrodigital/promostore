import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Package2, Plus, Pencil, Trash2, X, ShoppingBag, Calendar, User, LayoutDashboard, Upload, Mail, Edit } from 'lucide-react';
import { format, parseISO, isValid, parse } from 'date-fns';
import { Link } from 'react-router-dom';
import type { Order, PromoItem } from '../types';
import StatusDropdown from '../components/StatusDropdown';
import { useAuth } from '../context/AuthContext';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import DatePickerInput from '../components/DatePickerInput';
import vellumLogoWhite from '../Logo_Horizontal_White_wTagline_Artboard 1.svg';
import EmailSettings from '../components/EmailSettings';

interface EditingItem extends PromoItem {
  isNew?: boolean;
}

interface EditingOrderDates {
  orderId: string;
  currentPickupDate: Date | null;
  currentReturnDate: Date | null;
  status: Order['status'];
}

function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'email-settings'>('orders');
  const [items, setItems] = useState<PromoItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
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
    try {
      setLoading(true);
      setError(null);
      
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          items:checkouts (
            id,
            item_id,
            quantity,
            item:promo_items (
              id,
              name,
              description,
              image_url,
              total_quantity,
              available_quantity
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);
    } catch (err: any) {
      console.error('Error fetching orders:', err);
      setError(err.message);
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
        available_quantity: item.isNew ? item.total_quantity : item.available_quantity
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
      console.error('Error deleting item:', err);
      setError(err.message);
    }
  };

  const handleEditItem = (item: PromoItem) => {
    setEditingItem({
      ...item,
      isNew: false
    });
  };

  const updateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    const orderToNotify = orders.find(o => o.id === orderId); // Find the order details

    try {
      setProcessingOrders(prev => new Set([...prev, orderId]));
      setError(null);

      const { error: updateError } = await supabase.rpc(
        'update_order_status',
        {
          p_order_id: orderId,
          p_new_status: newStatus
        }
      );

      if (updateError) throw updateError;

      // Attempt to send email notification after status update
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

          // Send user notification based on status
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
      setError(err.message);
    } finally {
      setProcessingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const getAvailableStatuses = (currentStatus: Order['status']): Order['status'][] => {
    switch (currentStatus) {
      case 'pending':
        return ['pending', 'picked_up', 'cancelled'];
      case 'picked_up':
        return ['picked_up', 'returned'];
      case 'returned':
        return ['returned'];
      case 'cancelled':
        return ['cancelled'];
      default:
        return [];
    }
  };

  const handleOpenEditDatesModal = (order: Order) => {
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
      const updateData: Partial<Order> = {};
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
    <div className="min-h-screen bg-[#f8f9fc]">
      <div className="fixed left-0 top-0 h-full w-64 bg-gradient-to-b from-[rgb(0,54,86)] to-[rgb(0,117,174)] text-white p-6">
        <div className="mb-10">
          <Link to="/">
            <img src={vellumLogoWhite} alt="Vellum Logo" className="h-10 w-auto" />
          </Link>
        </div>
        
        <nav className="space-y-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'orders'
                ? 'bg-[#2192D0] text-white'
                : 'text-gray-300 hover:bg-[#2192D0]/80 hover:text-white'
            }`}
          >
            <ShoppingBag className="h-5 w-5" />
            <span>Orders</span>
          </button>
          
          <button
            onClick={() => setActiveTab('inventory')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'inventory'
                ? 'bg-[#2192D0] text-white'
                : 'text-gray-300 hover:bg-[#2192D0]/80 hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Inventory</span>
          </button>

          <button
            onClick={() => setActiveTab('email-settings')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'email-settings'
                ? 'bg-[#2192D0] text-white'
                : 'text-gray-300 hover:bg-[#2192D0]/80 hover:text-white'
            }`}
          >
            <Mail className="h-5 w-5" />
            <span>Email Settings</span>
          </button>

          <Link
            to="/"
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-gray-300 hover:bg-[#2192D0]/60 hover:text-white mt-4"
          >
            <Package2 className="h-5 w-5" />
            <span>View Store</span>
          </Link>
        </nav>
      </div>

      <div className="ml-64 p-8">
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
                id: '',
                name: '',
                description: '',
                image_url: '',
                total_quantity: 0,
                available_quantity: 0,
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
                      {orders.map((order) => (
                        <tr key={order.id}>
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
                          <td className="px-6 py-4">
                            <ul className="list-disc list-inside text-sm text-[#58595B] opacity-80">
                              {order.items.map((checkout) => (
                                <li key={checkout.id}>
                                  {checkout.item ? `${checkout.item.name} (Qty: ${checkout.quantity})` : 'Item not found'}
                                </li>
                              ))}
                            </ul>
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : activeTab === 'inventory' ? (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 h-16 w-16">
                      {item.image_url ? (
                        <img
                          className="h-16 w-16 rounded-lg object-cover"
                          src={item.image_url}
                          alt={item.name}
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Package2 className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-[#58595B]">{item.name}</h3>
                      <p className="text-sm text-gray-500">{item.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-[#58595B]">
                        Available: {item.available_quantity} / {item.total_quantity}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditItem(item)}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this item?')) {
                            handleDeleteItem(item.id);
                          }
                        }}
                        className="p-2 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmailSettings />
        )}

        {editingItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-[#58595B]">
                  {editingItem.isNew ? 'Add New Item' : 'Edit Item'}
                </h2>
                <button
                  onClick={() => setEditingItem(null)}
                  disabled={saving}
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
                      onChange={(e) => setEditingItem({ ...editingItem, available_quantity: parseInt(e.target.value) })}
                      disabled={editingItem.isNew}
                      className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#2c3e50] focus:ring-[#2c3e50] disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setEditingItem(null)}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveItem(editingItem)}
                  disabled={saving}
                  className="px-4 py-2 bg-[#2c3e50] text-white rounded-lg shadow-sm text-sm font-medium hover:bg-[#34495e] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isEditDatesModalOpen && editingOrderDates && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-600 bg-opacity-75 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
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
      </div>
    </div>
  );
}

export default AdminDashboard;