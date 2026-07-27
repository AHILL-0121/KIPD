'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { KipdMascot } from '@/components/mascot/KipdMascot';
import { ShoppingCart, Plus, Minus, Send, Check } from 'lucide-react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
  tags: string[];
}

interface CartItem extends MenuItem {
  quantity: number;
  notes?: string;
}

export default function MenuPage({ 
  params 
}: { 
  params: { restaurantSlug: string; tableId: string } 
}) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showCart, setShowCart] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  const [tableNumber, setTableNumber] = useState('');

  useEffect(() => {
    // Fetch menu
    fetch(`/api/menu/${params.restaurantSlug}`)
      .then(res => res.json())
      .then(data => {
        setMenuItems(data.items);
        setRestaurantName(data.restaurantName);
      })
      .catch(console.error);

    // Fetch table info
    fetch(`/api/tables/${params.tableId}`)
      .then(res => res.json())
      .then(data => setTableNumber(data.tableNumber))
      .catch(console.error);
  }, [params.restaurantSlug, params.tableId]);

  const categories = ['all', ...Array.from(new Set(menuItems.map(item => item.category)))];
  
  const filteredItems = menuItems.filter(item => 
    selectedCategory === 'all' || item.category === selectedCategory
  );

  const addToCart = (item: MenuItem) => {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      setCart(cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const removeFromCart = (itemId: string) => {
    const existing = cart.find(c => c.id === itemId);
    if (existing && existing.quantity > 1) {
      setCart(cart.map(c => c.id === itemId ? { ...c, quantity: c.quantity - 1 } : c));
    } else {
      setCart(cart.filter(c => c.id !== itemId));
    }
  };

  const placeOrder = async () => {
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantSlug: params.restaurantSlug,
        tableId: params.tableId,
        items: cart.map(c => ({
          menuItemId: c.id,
          quantity: c.quantity,
          notes: c.notes,
        })),
      }),
    });
    
    setOrderPlaced(true);
    setCart([]);
    setTimeout(() => setOrderPlaced(false), 5000);
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KipdMascot size="sm" animated={false} />
              <div>
                <h1 className="font-serif text-xl font-bold text-ink">{restaurantName}</h1>
                <p className="text-xs text-ink-muted">Table {tableNumber}</p>
              </div>
            </div>
            
            <button
              onClick={() => setShowCart(true)}
              className="relative p-3 bg-amber rounded-xl shadow-md"
            >
              <ShoppingCart className="w-6 h-6 text-ink" />
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-terra text-white rounded-full text-xs flex items-center justify-center font-bold">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Categories */}
      <div className="sticky top-20 z-30 bg-white border-b border-stone-200 py-3 px-4 overflow-x-auto">
        <div className="flex gap-2 max-w-4xl mx-auto">
          {categories.map(cat => (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? 'primary' : 'ghost'}
              onClick={() => setSelectedCategory(cat)}
              className="whitespace-nowrap"
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Menu Items */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="space-y-4">
          {filteredItems.map((item) => (
            <Card key={item.id} hover className="p-4 flex gap-4">
              {item.imageUrl && (
                <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                  <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg text-ink mb-1">{item.name}</h3>
                <p className="text-sm text-ink-muted mb-2 line-clamp-2">{item.description}</p>
                
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {item.tags.map(tag => (
                    <Badge key={tag} variant="stone" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold text-amber">${item.price}</span>
                  
                  <Button size="sm" onClick={() => addToCart(item)}>
                    <Plus className="w-4 h-4" />
                    Add
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>

      {/* Cart Drawer */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowCart(false)}
            />
            
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b border-stone-200">
                <h2 className="font-serif text-2xl font-bold text-ink">Your Order</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {cart.map((item) => (
                  <div key={item.id} className="flex gap-4">
                    <div className="flex-1">
                      <h3 className="font-medium text-ink">{item.name}</h3>
                      <p className="text-sm text-ink-muted">${item.price} each</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        onClick={() => addToCart(item)}
                        className="w-8 h-8 rounded-lg bg-amber flex items-center justify-center"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {cart.length === 0 && (
                  <div className="text-center py-16 text-ink-muted">
                    Your cart is empty
                  </div>
                )}
              </div>
              
              {cart.length > 0 && (
                <div className="p-6 border-t border-stone-200 space-y-4">
                  <div className="flex justify-between text-2xl font-bold">
                    <span>Total</span>
                    <span className="text-amber">${cartTotal.toFixed(2)}</span>
                  </div>
                  
                  <Button
                    variant="terra"
                    className="w-full text-lg py-4"
                    onClick={placeOrder}
                  >
                    <Send className="w-5 h-5" />
                    Place Order
                  </Button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Order Confirmation Toast */}
      <AnimatePresence>
        {orderPlaced && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-sage text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
              <Check className="w-6 h-6" />
              <div>
                <div className="font-bold">Order placed!</div>
                <div className="text-sm opacity-90">Your food will be ready soon</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
