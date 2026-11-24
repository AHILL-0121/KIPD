export interface MenuCategory {
  id: string;
  name: string;
  sortOrder?: number;
}

export interface MenuItemVariant {
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  category?: MenuCategory;
  tags: string[];
  isAvailable: boolean;
  imageUrl?: string | null;
  variants?: MenuItemVariant[] | null;
}

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  section?: string | null;
  tags?: string[] | null;
  qrCode?: string;
  outlet?: { name: string; slug: string };
}
