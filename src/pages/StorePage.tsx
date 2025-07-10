import React, { useState } from 'react';

// Types
interface StoreItem {
  id: number;
  name: string;
  description: string;
  image_url: string;
  price: number;
  sizes: string[];
  colors: string[];
  available_quantity: number;
}

interface CartItem extends StoreItem {
  size?: string;
  color?: string;
  quantity: number;
}

// Mock data for store items
const mockStoreItems: StoreItem[] = [
  {
    id: 1,
    name: 'VELLUM ENGRAVED 20 OZ YETI TRAVEL MUG',
    description: 'Premium Yeti mug with Vellum engraving.',
    image_url: 'https://yourdomain.com/images/yeti-mug.png',
    price: 41.55,
    sizes: [],
    colors: ['White'],
    available_quantity: 10,
  },
  {
    id: 2,
    name: 'VELLUM BABY "CLEAR TO CUDDLE" ONESIE',
    description: 'Adorable Vellum baby onesie.',
    image_url: 'https://yourdomain.com/images/onesie.png',
    price: 14.99,
    sizes: ['Newborn', '6M', '12M', '18M'],
    colors: ['Gray'],
    available_quantity: 20,
  },
  {
    id: 3,
    name: 'VELLUM BLUE AND GOLD TEXT SHIRT',
    description: 'Blue shirt with gold Vellum text.',
    image_url: 'https://yourdomain.com/images/blue-gold-shirt.png',
    price: 17.10,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Blue'],
    available_quantity: 15,
  },
  // Add more items as needed
];

function StorePage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showInvoice, setShowInvoice] = useState(false);

  const addToCart = (item: StoreItem, size?: string, color?: string) => {
    setCart(prev => [...prev, { ...item, size, color, quantity: 1 }]);
  };

  const handleCheckout = () => {
    setShowInvoice(true);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 32 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: '#003656', marginBottom: 24 }}>Vellum Store</h1>
      {/* Cart summary */}
      <div style={{ marginBottom: 32, background: '#f4f4f4', padding: 16, borderRadius: 8 }}>
        <strong>Cart:</strong> {cart.length} item(s)
        {cart.length > 0 && (
          <button onClick={handleCheckout} style={{ marginLeft: 16, background: '#0075AE', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
            Generate Invoice
          </button>
        )}
      </div>
      {/* Store items grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
        {mockStoreItems.map(item => (
          <StoreItemCard key={item.id} item={item} onAddToCart={addToCart} />
        ))}
      </div>
      {/* Invoice modal */}
      {showInvoice && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 32, borderRadius: 8, minWidth: 320 }}>
            <h2>Invoice</h2>
            <ul>
              {cart.map((item, idx) => (
                <li key={idx}>{item.name} {item.size && `(${item.size})`} {item.color && `- ${item.color}`} - ${item.price.toFixed(2)}</li>
              ))}
            </ul>
            <p><strong>Total: ${cart.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</strong></p>
            <p style={{ color: '#0075AE' }}>An invoice will be generated and sent to your email. Please pay offline.</p>
            <button onClick={() => setShowInvoice(false)} style={{ marginTop: 16, background: '#0075AE', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface StoreItemCardProps {
  item: StoreItem;
  onAddToCart: (item: StoreItem, size?: string, color?: string) => void;
}

function StoreItemCard({ item, onAddToCart }: StoreItemCardProps) {
  const [selectedSize, setSelectedSize] = useState(item.sizes[0] || '');
  const [selectedColor, setSelectedColor] = useState(item.colors[0] || '');

  return (
    <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <img src={item.image_url} alt={item.name} style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: 16 }} />
      <h3 style={{ fontSize: 18, fontWeight: 600, color: '#003656', marginBottom: 8, textAlign: 'center' }}>{item.name}</h3>
      <p style={{ color: '#555', fontSize: 14, marginBottom: 8, textAlign: 'center' }}>{item.description}</p>
      <div style={{ fontWeight: 700, color: '#0075AE', marginBottom: 8 }}>${item.price.toFixed(2)}</div>
      {item.sizes.length > 0 && (
        <select value={selectedSize} onChange={e => setSelectedSize(e.target.value)} style={{ marginBottom: 8, padding: 4, borderRadius: 4 }}>
          {item.sizes.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      )}
      {item.colors.length > 0 && (
        <select value={selectedColor} onChange={e => setSelectedColor(e.target.value)} style={{ marginBottom: 8, padding: 4, borderRadius: 4 }}>
          {item.colors.map(color => <option key={color} value={color}>{color}</option>)}
        </select>
      )}
      <button onClick={() => onAddToCart(item, selectedSize, selectedColor)} style={{ background: '#0075AE', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer', marginTop: 8 }}>
        Add to Cart
      </button>
    </div>
  );
}

export default StorePage; 