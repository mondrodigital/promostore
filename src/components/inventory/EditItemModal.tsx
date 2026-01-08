import React from 'react';
import { X, Package2, Upload } from 'lucide-react';
import type { PromoItem } from '../../types';

type Category = 'Tents' | 'Tables' | 'Linens' | 'Displays' | 'Decor' | 'Games' | 'Misc';

export interface EditingItem extends Omit<PromoItem, 'id' | 'created_at'> {
  id: string | null;
  created_at?: string;
  isNew?: boolean;
}

interface EditItemModalProps {
  item: EditingItem;
  onClose: () => void;
  onSave: (item: EditingItem) => Promise<void>;
  onImageUpload: (file: File) => Promise<void>;
  saving: boolean;
  uploadingImage: boolean;
}

const categories: { value: Category; label: string }[] = [
  { value: 'Tents', label: 'Tents' },
  { value: 'Tables', label: 'Tables' },
  { value: 'Linens', label: 'Linens' },
  { value: 'Displays', label: 'Displays' },
  { value: 'Decor', label: 'Decor' },
  { value: 'Games', label: 'Games' },
  { value: 'Misc', label: 'Miscellaneous' }
];

export default function EditItemModal({
  item,
  onClose,
  onSave,
  onImageUpload,
  saving,
  uploadingImage
}: EditItemModalProps) {
  const [editingItem, setEditingItem] = React.useState<EditingItem>(item);

  const handleSave = () => {
    onSave(editingItem);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {editingItem.isNew ? 'Add New Item' : 'Edit Item'}
          </h2>
          <button
            onClick={onClose}
            disabled={saving || uploadingImage}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editingItem.name}
              onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none"
              placeholder="Enter item name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={editingItem.description || ''}
              onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none resize-none"
              placeholder="Describe this item..."
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={editingItem.category || 'Misc'}
              onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as Category })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none"
            >
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Image</label>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 h-24 w-24 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
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
                <label className="relative cursor-pointer inline-block">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onImageUpload(file);
                      }
                    }}
                    disabled={uploadingImage}
                  />
                  <div className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingImage ? 'Uploading...' : 'Upload Image'}
                  </div>
                </label>
                <p className="mt-1 text-xs text-gray-500">
                  Click to upload. Max file size: 5MB
                </p>
              </div>
            </div>
          </div>

          {/* Quantities */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Quantity
              </label>
              <input
                type="number"
                min="0"
                value={editingItem.total_quantity}
                onChange={(e) => {
                  const newTotal = parseInt(e.target.value) || 0;
                  setEditingItem({
                    ...editingItem,
                    total_quantity: newTotal,
                    available_quantity: editingItem.isNew ? newTotal : editingItem.available_quantity
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Available Quantity
              </label>
              <input
                type="number"
                min="0"
                max={editingItem.total_quantity}
                value={editingItem.available_quantity}
                onChange={(e) => setEditingItem({ ...editingItem, available_quantity: parseInt(e.target.value) || 0 })}
                disabled={editingItem.isNew}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              {editingItem.isNew && (
                <p className="mt-1 text-xs text-gray-500">
                  Auto-set to total quantity for new items
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving || uploadingImage}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploadingImage || !editingItem.name.trim()}
            className="px-4 py-2 bg-[#0075AE] text-white rounded-lg text-sm font-medium hover:bg-[#005f8c] transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : (editingItem.isNew ? 'Add Item' : 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
}
