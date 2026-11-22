export interface OrderItem {
  id: string;
  quantity: number;
  price: string;
  notes?: string;
  menuItem?: { id: string; name: string; price: string };
}

export interface Order {
  id: string;
  type: 'dine_in' | 'room_service' | 'take_away';
  tableId?: string;
  roomId?: string;
  table?: { tableNumber: string };
  status: 'new' | 'acknowledged' | 'preparing' | 'ready' | 'served' | 'closed' | 'cancelled';
  totalAmount: string;
  specialInstructions?: string;
  /** 'guest' when the guest ordered from the QR menu themselves */
  source?: 'staff' | 'guest';
  orderItems: OrderItem[];
  createdAt: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: string;
  isAvailable: boolean;
  category?: { name: string };
}

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

export interface TableOption {
  id: string;
  tableNumber: string;
  capacity: number;
  section?: string | null;
  tags?: string[] | null;
}

export interface TableTab {
  table: TableOption;
  total: number;
  tickets: Order[];
}
