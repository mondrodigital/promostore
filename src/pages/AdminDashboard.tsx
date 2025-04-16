import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Package2, Plus, Pencil, Trash2, X, ShoppingBag, Calendar, User, LayoutDashboard, Upload, Mail } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import type { Order, PromoItem } from '../types';
import StatusDropdown from '../components/StatusDropdown';
import { useAuth } from '../context/AuthContext';
import EmailPrompts from '../components/EmailPrompts';

interface EditingItem extends PromoItem {
  isNew?: boolean;
}

function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'email-prompts'>('orders');
  const [items, setItems] = useState<PromoItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingOrders, setProcessingOrders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/');
      return;
    }

    if (activeTab === 'inventory') {
      fetchItems();
    } else if (activeTab === 'orders') {
      fetchOrders();
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
      <div className="fixed left-0 top-0 h-full w-64 bg-[#2c3e50] text-white p-6">
        <div className="flex items-center space-x-3 mb-10">
          <Package2 className="h-8 w-8" />
          <h1 className="text-xl font-semibold">Inventory Pro</h1>
        </div>
        
        <nav className="space-y-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'orders'
                ? 'bg-[#34495e] text-white'
                : 'text-gray-300 hover:bg-[#34495e] hover:text-white'
            }`}
          >
            <ShoppingBag className="h-5 w-5" />
            <span>Orders</span>
          </button>
          
          <button
            onClick={() => setActiveTab('inventory')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'inventory'
                ? 'bg-[#34495e] text-white'
                : 'text-gray-300 hover:bg-[#34495e] hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span>Inventory</span>
          </button>

          <button
            onClick={() => setActiveTab('email-prompts')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'email-prompts'
                ? 'bg-[#34495e] text-white'
                : 'text-gray-300 hover:bg-[#34495e] hover:text-white'
            }`}
          >
            <Mail className="h-5 w-5" />
            <span>Email Prompts</span>
          </button>

          <Link
            to="/"
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-gray-300 hover:bg-[#34495e] hover:text-white mt-4"
          >
            <Package2 className="h-5 w-5" />
            <span>View Store</span>
          </Link>
        </nav>
      </div>

      <div className="ml-64 p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {activeTab === 'orders' ? 'Orders' : 
               activeTab === 'inventory' ? 'Inventory' : 
               'Email Prompts'}
            </h1>
            <p className="text-gray-500 mt-1">
              {activeTab === 'orders' ? 'Manage and track customer orders' : 
               activeTab === 'inventory' ? 'Manage your inventory items' :
               'Copy and customize email templates'}
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
            {orders.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl shadow-sm">
                <ShoppingBag className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No orders found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  There are no orders in the system yet.
                </p>
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className="h-12 w-12 bg-[#2c3e50] rounded-full flex items-center justify-center">
                            <User className="h-6 w-6 text-white" />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{order.user_name}</h3>
                          <p className="text-sm text-gray-500">{order.user_email}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Ordered on {format(parseISO(order.created_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6">
                        <StatusDropdown
                          status={order.status}
                          orderId={order.id}
                          onStatusChange={updateOrderStatus}
                          disabled={processingOrders.has(order.id)}
                          availableStatuses={getAvailableStatuses(order.status)}
                        />
                        <div className="px-4 py-2 bg-gray-50 rounded-full">
                          <span className="text-sm font-medium text-gray-700">
                            {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {order.items.map(item => (
                      <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center space-x-4">
                          <div className="flex-shrink-0 h-16 w-16">
                            {item.item?.image_url ? (
                              <img
                                src={item.item.image_url}
                                alt={item.item.name}
                                className="h-16 w-16 object-cover rounded-lg"
                              />
                            ) : (
                              <div className="h-16 w-16 bg-gray-100 rounded-lg flex items-center justify-center">
                                <Package2 className="h-8 w-8 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="text-lg font-medium text-gray-900">
                              {item.item?.name}
                            </h4>
                            <p className="text-sm text-gray-500 mt-1">
                              Quantity: <span className="font-medium">{item.quantity}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-6 bg-gray-50 border-t border-gray-100">
                    <div className="flex items-center space-x-6 text-sm text-gray-500">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span>Pickup: {format(parseISO(order.checkout_date), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span>Return: {format(parseISO(order.return_date), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
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
                      <h3 className="text-lg font-medium text-gray-900">{item.name}</h3>
                      <p className="text-sm text-gray-500">{item.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
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
          <EmailPrompts />
        )}

        {editingItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
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
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#2c3e50] focus:ring-[#2c3e50]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-[#2c3e50] focus:ring-[#2c3e50]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Image</label>
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
                        <div className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
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
                    <label className="block text-sm font-medium text-gray-700">Total Quantity</label>
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
                    <label className="block text-sm font-medium text-gray-700">Available Quantity</label>
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
      </div>
    </div>
  );
}

export default AdminDashboard;