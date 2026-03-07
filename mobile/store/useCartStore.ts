import { create } from 'zustand';

export type CartItem = {
  id: string;
  name: string;
  checked: boolean;
  hidden: boolean;
  suggested: boolean;    // Added by AI via processIntent ("AI pick" badge)
  restocked?: boolean;   // Added by the restock agent ("restock" badge)
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
};

export type StoreCoords = {
  lat: number;
  lng: number;
};

export type Store = {
  name: string;
  type: string;
  coords: StoreCoords | null;
  radiusMetres: number;
};

// Records one item that the user actually purchased (checked off + cleared)
export type PurchaseRecord = {
  name: string;
  lastBoughtAt: number;  // Unix timestamp in milliseconds
  storeWhere: string;    // Store name where it was bought
  count: number;         // Total times purchased across all sessions
};

export const STORES: Store[] = [
  { name: 'No store selected', type: 'none',              coords: null, radiusMetres: 300 },
  { name: 'Walmart',           type: 'general_superstore', coords: null, radiusMetres: 300 },
  { name: 'FreshCo',           type: 'grocery_only',       coords: null, radiusMetres: 300 },
  { name: 'Home Depot',        type: 'hardware_only',      coords: null, radiusMetres: 300 },
  { name: 'Shell Gas',         type: 'fuel_station',       coords: null, radiusMetres: 300 },
];

type CartState = {
  // Shopping list
  items: CartItem[];
  addItem: (name: string, suggested?: boolean, restocked?: boolean) => void;
  removeItem: (id: string) => void;
  toggleItem: (id: string) => void;
  setItems: (items: CartItem[]) => void;
  clearChecked: () => void;  // Records purchases before removing checked items

  // Chat
  messages: ChatMessage[];
  addMessage: (role: 'user' | 'bot', content: string) => void;
  clearChat: () => void;

  // Store context
  stores: Store[];
  selectedStore: Store;
  setSelectedStore: (store: Store) => void;
  saveStoreLocation: (storeName: string, coords: StoreCoords) => void;

  // Location state
  userCoords: StoreCoords | null;
  setUserCoords: (coords: StoreCoords) => void;
  nearbyStore: Store | null;
  setNearbyStore: (store: Store | null) => void;

  // Bot reasoning shown on the list screen
  botNote: string | null;
  setBotNote: (note: string | null) => void;

  // Purchase history — persisted to AsyncStorage by _layout.tsx
  purchaseHistory: PurchaseRecord[];
  setPurchaseHistory: (history: PurchaseRecord[]) => void;
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (name, suggested = false, restocked = false) =>
    set((state) => ({
      items: [
        ...state.items,
        {
          id: Date.now().toString(),
          name,
          checked: false,
          hidden: false,
          suggested,
          restocked,
        },
      ],
    })),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  toggleItem: (id) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, checked: !i.checked } : i
      ),
    })),

  setItems: (items) => set({ items }),

  // Before removing checked items, record each one in purchaseHistory
  clearChecked: () =>
    set((state) => {
      const checkedItems = state.items.filter((i) => i.checked);
      const storeName = state.selectedStore.name;
      const now = Date.now();

      // Build an updated history map (name → record)
      const historyMap = new Map<string, PurchaseRecord>(
        state.purchaseHistory.map((r) => [r.name.toLowerCase(), r])
      );

      for (const item of checkedItems) {
        const key = item.name.toLowerCase();
        const existing = historyMap.get(key);
        if (existing) {
          // Update existing record
          historyMap.set(key, {
            ...existing,
            lastBoughtAt: now,
            storeWhere: storeName,
            count: existing.count + 1,
          });
        } else {
          // First time buying this item
          historyMap.set(key, {
            name: item.name,
            lastBoughtAt: now,
            storeWhere: storeName,
            count: 1,
          });
        }
      }

      return {
        items: state.items.filter((i) => !i.checked),
        purchaseHistory: Array.from(historyMap.values()),
      };
    }),

  messages: [
    {
      id: '0',
      role: 'bot',
      content:
        "Hi! I'm your Ghost-Cart assistant 👋 Tell me what you need and I'll build your shopping list. Try: \"I need ingredients for pasta\" or \"high protein breakfast ideas\".",
      timestamp: new Date(),
    },
  ],

  addMessage: (role, content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { id: Date.now().toString(), role, content, timestamp: new Date() },
      ],
    })),

  clearChat: () => set({ messages: [] }),

  stores: STORES,
  selectedStore: STORES[0],
  setSelectedStore: (store) => set({ selectedStore: store }),

  saveStoreLocation: (storeName, coords) =>
    set((state) => ({
      stores: state.stores.map((s) =>
        s.name === storeName ? { ...s, coords } : s
      ),
    })),

  userCoords: null,
  setUserCoords: (coords) => set({ userCoords: coords }),

  nearbyStore: null,
  setNearbyStore: (store) => set({ nearbyStore: store }),

  botNote: null,
  setBotNote: (note) => set({ botNote: note }),

  purchaseHistory: [],
  setPurchaseHistory: (history) => set({ purchaseHistory: history }),
}));
