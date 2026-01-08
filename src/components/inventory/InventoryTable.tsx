import React from 'react';
import { Package2, Pencil, Trash2, Plus, Search } from 'lucide-react';
import type { PromoItem } from '../../types';

interface InventoryTableProps {
  items: PromoItem[];
  loading: boolean;
  onAddNew: () => void;
  onEdit: (item: PromoItem) => void;
  onDelete: (itemId: string) => void;
}

export default function InventoryTable({
  items,
  loading,
  onAddNew,
  onEdit,
  onDelete
}: InventoryTableProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) return items;
    
    const query = searchQuery.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0075AE]"></div>
          <p className="text-gray-500">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Search and Add Button */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search inventory..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0075AE] focus:border-transparent outline-none"
          />
        </div>

        {/* Add Button */}
        <button
          onClick={onAddNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0075AE] text-white rounded-lg hover:bg-[#005f8c] transition-colors font-medium"
        >
          <Plus className="h-5 w-5" />
          Add New Item
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package2 className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery ? 'No items found' : 'No inventory items yet'}
            </h3>
            <p className="text-gray-500 mb-4">
              {searchQuery 
                ? 'Try adjusting your search terms'
                : 'Add your first item to get started'
              }
            </p>
            {!searchQuery && (
              <button
                onClick={onAddNew}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0075AE] text-white rounded-lg hover:bg-[#005f8c] transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add First Item
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Available
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map(item => {
                  const availabilityPercent = item.total_quantity > 0 
                    ? (item.available_quantity / item.total_quantity) * 100 
                    : 0;
                  const isLowStock = availabilityPercent > 0 && availabilityPercent <= 25;
                  const isOutOfStock = item.available_quantity === 0;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      {/* Item with Image */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                            {item.image_url ? (
                              <img 
                                src={item.image_url} 
                                alt={item.name} 
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package2 className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{item.name}</p>
                            <p className="text-sm text-gray-500 md:hidden truncate">{item.description}</p>
                          </div>
                        </div>
                      </td>

                      {/* Description (Hidden on mobile) */}
                      <td className="px-4 py-4 hidden md:table-cell">
                        <p className="text-sm text-gray-600 line-clamp-2 max-w-xs">
                          {item.description || '-'}
                        </p>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {item.category}
                        </span>
                      </td>

                      {/* Total Quantity */}
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm font-medium text-gray-900">{item.total_quantity}</span>
                      </td>

                      {/* Available Quantity */}
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isOutOfStock 
                            ? 'bg-red-100 text-red-700'
                            : isLowStock
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                        }`}>
                          {item.available_quantity}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onEdit(item)}
                            className="p-2 text-gray-400 hover:text-[#0075AE] hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit item"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
                                onDelete(item.id);
                              }
                            }}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {filteredItems.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500 px-1">
          <span>
            Showing {filteredItems.length} of {items.length} items
          </span>
          <span>
            Total inventory: {items.reduce((sum, item) => sum + item.total_quantity, 0)} items
          </span>
        </div>
      )}
    </div>
  );
}
