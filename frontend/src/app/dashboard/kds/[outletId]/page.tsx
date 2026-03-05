'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { KipdIllustration } from '@/components/mascot/KipdIllustration';
import { Clock, MapPin, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';

interface KDSOrder {
  id: string;
  type: 'dine_in' | 'room_service';
  tableNumber?: string;
  roomNumber?: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string;
  }>;
  status: 'new' | 'acknowledged' | 'preparing' | 'ready';
  specialInstructions?: string;
  createdAt: string;
}

export default function KDSPage({ params }: { params: { outletId: string } }) {
  const [orders, setOrders] = useState<KDSOrder[]>([]);

  useEffect(() => {
    // Fetch initial orders
    fetch(`/api/kds/${params.outletId}`)
      .then(res => res.json())
      .then(data => setOrders(data))
      .catch(console.error);

    // Setup SSE for real-time updates
    const eventSource = new EventSource(`/api/sse/kds/${params.outletId}`);
    eventSource.onmessage = (event) => {
      const newOrder = JSON.parse(event.data);
      setOrders(prev => [newOrder, ...prev]);
      
      // Play sound alert
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {});
    };

    return () => eventSource.close();
  }, [params.outletId]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    
    setOrders(orders.filter(o => o.id !== orderId || (newStatus !== 'ready')));
  };

  return (
    <div className="min-h-screen bg-ink p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-stone-700">
        <div>
          <h1 className="font-serif text-3xl font-bold text-white mb-2">
            Kitchen Display System
          </h1>
          <p className="text-stone-400">Real-time order queue</p>
        </div>
        
        <StatusIndicator label="Live Updates" status="live" />
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {orders.map((order) => {
          const minutesAgo = differenceInMinutes(new Date(), new Date(order.createdAt));
          const isUrgent = minutesAgo > 15;
          const timeAgo = formatDistanceToNow(new Date(order.createdAt), { addSuffix: true });
          
          return (
            <div
              key={order.id}
              className={`
                bg-white rounded-2xl p-6 shadow-xl
                border-4 transition-all duration-300
                ${isUrgent ? 'border-terra animate-pulse' : 'border-transparent'}
                ${order.status === 'new' ? 'ring-4 ring-amber' : ''}
              `}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-5 h-5 text-ink-muted" />
                    <span className="font-bold text-2xl text-ink">
                      {order.type === 'dine_in' 
                        ? `Table ${order.tableNumber}` 
                        : `Room ${order.roomNumber}`
                      }
                    </span>
                  </div>
                  
                  <div className={`flex items-center gap-2 text-sm ${isUrgent ? 'text-terra font-bold' : 'text-ink-muted'}`}>
                    {isUrgent && <AlertCircle className="w-4 h-4" />}
                    <Clock className="w-4 h-4" />
                    <span>{timeAgo} ({minutesAgo} min)</span>
                  </div>
                </div>
                
                <Badge 
                  variant={order.status === 'new' ? 'amber' : order.status === 'preparing' ? 'terra' : 'stone'}
                  className="text-base"
                >
                  {order.status}
                </Badge>
              </div>
              
              {/* Items */}
              <div className="space-y-3 mb-6">
                {order.items.map((item, idx) => (
                  <div key={idx} className="border-l-4 border-amber pl-3">
                    <div className="font-bold text-xl text-ink mb-1">
                      {item.quantity}x {item.name}
                    </div>
                    {item.notes && (
                      <div className="text-sm text-terra italic bg-terra-pale p-2 rounded">
                        ⚠️ {item.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {order.specialInstructions && (
                <div className="bg-amber-pale border-2 border-amber p-4 rounded-xl mb-4 text-ink">
                  <div className="font-bold mb-1">Special Instructions:</div>
                  <div className="text-sm">{order.specialInstructions}</div>
                </div>
              )}
              
              {/* Actions */}
              <div className="flex gap-3">
                {order.status === 'new' && (
                  <Button 
                    className="flex-1 text-lg py-4"
                    variant="terra"
                    onClick={() => updateStatus(order.id, 'preparing')}
                  >
                    Start Preparing
                  </Button>
                )}
                
                {order.status === 'preparing' && (
                  <Button 
                    className="flex-1 text-lg py-4"
                    variant="sage"
                    onClick={() => updateStatus(order.id, 'ready')}
                  >
                    Mark Ready
                  </Button>
                )}
                
                {order.status === 'acknowledged' && (
                  <Button 
                    className="flex-1 text-lg py-4"
                    variant="terra"
                    onClick={() => updateStatus(order.id, 'preparing')}
                  >
                    Start Cooking
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {orders.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-12 inline-block">
              <KipdIllustration 
                scene="order-ready" 
                size="xl" 
              />
              <p className="text-white text-2xl font-display mt-8">All Caught Up!</p>
              <p className="text-stone-400 mt-3 text-lg">New orders will appear here automatically</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
