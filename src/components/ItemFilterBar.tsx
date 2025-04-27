import React from 'react';
import { LayoutGrid, Tent, Table2, Layers, Presentation, Home, Gamepad2, Package } from 'lucide-react';

type Category = 'All' | 'Tents' | 'Tables' | 'Linens' | 'Displays' | 'Decor' | 'Games' | 'Misc';

interface CategoryInfo {
  name: Category;
  icon: React.ElementType;
}

const categories: CategoryInfo[] = [
  { name: 'All', icon: LayoutGrid },
  { name: 'Tents', icon: Tent },
  { name: 'Tables', icon: Table2 },
  { name: 'Linens', icon: Layers },
  { name: 'Displays', icon: Presentation },
  { name: 'Decor', icon: Home },
  { name: 'Games', icon: Gamepad2 },
  { name: 'Misc', icon: Package },
];

interface ItemFilterBarProps {
  activeFilter: Category;
  onFilterChange: (filter: Category) => void;
}

export default function ItemFilterBar({ activeFilter, onFilterChange }: ItemFilterBarProps) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 mb-6">
      <div className="flex space-x-12 overflow-x-auto custom-scrollbar">
        {categories.map(({ name, icon: IconComponent }) => (
          <button
            key={name}
            onClick={() => onFilterChange(name)}
            className={`flex flex-col items-center space-y-1 flex-shrink-0 group focus:outline-none transition-opacity duration-200 ${
              activeFilter === name ? 'opacity-100' : 'opacity-60 hover:opacity-100'
            }`}
          >
            <IconComponent className={`h-6 w-6 mb-1 ${activeFilter === name ? 'text-[#0075AE]' : 'text-gray-600'}`} />
            <span className={`text-xs font-medium ${activeFilter === name ? 'text-[#0075AE]' : 'text-gray-700'}`}>
              {name}
            </span>
             <div className={`w-full h-0.5 mt-1 ${activeFilter === name ? 'bg-[#0075AE]' : 'bg-transparent group-hover:bg-gray-300'}`}></div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Add custom scrollbar CSS if needed (e.g., in index.css):
/*
.custom-scrollbar::-webkit-scrollbar {
  height: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #aaa;
}
*/ 