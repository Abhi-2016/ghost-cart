import axios from 'axios';

// Point this at your gateway. On a real device, replace with your
// machine's local IP address (e.g. http://192.168.1.x:3000)
const BASE_URL = 'http://localhost:3000';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

export type StoreContext = {
  name: string;
  type: string;
};

export type PurchaseHistoryItem = {
  item: string;
  last_purchased_days_ago: number;
};

export type IntentResult = {
  action: 'notify' | 'delay_notify' | 'predictive_notify';
  items_to_surface: string[];
  items_to_hide: string[];
  dwell_threshold_seconds: number | null;
  items_to_surface_after_threshold: string[];
  suggested_items: string[];
  notification_copy: string | null;
  reasoning: string;
  _cache: 'HIT' | 'MISS';
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// Shape of one record sent to the restock agent
export type PurchaseRecord = {
  name: string;
  last_bought_at_ms: number;  // Unix ms — brain converts to days elapsed
  store_where: string;
  count: number;
};

// What the restock agent returns for each item it decides to add
export type RestockItem = {
  name: string;
  reason: string;  // e.g. "Last bought 12 days ago"
};

export type RestockResult = {
  items_to_add: RestockItem[];
  agent_note: string | null;
};

/**
 * Ask the AI to filter and rank the shopping list based on the current store.
 */
export async function processIntent(
  store: StoreContext,
  userList: string[],
  purchaseHistory: PurchaseHistoryItem[] = []
): Promise<IntentResult> {
  const { data } = await client.post('/api/v1/intent/process-intent', {
    store,
    user_list: userList,
    purchase_history: purchaseHistory,
  });
  return data;
}

/**
 * Run the agentic restock loop on the brain.
 * Claude autonomously decides which items from purchase history to add back.
 */
export async function checkRestock(
  store: StoreContext,
  currentList: string[],
  purchaseHistory: PurchaseRecord[]
): Promise<RestockResult> {
  const { data } = await client.post('/api/v1/restock/check', {
    store,
    current_list: currentList,
    purchase_history: purchaseHistory,
  });
  return data;
}

/**
 * Ask the AI for grocery recommendations based on a natural language query.
 * Used by the chat bot to suggest items and add them to the list.
 */
export async function getRecommendations(
  query: string,
  lat: number = 37.77,
  lng: number = -122.41
): Promise<{ items: any[]; reasoning: string; _cache: string }> {
  const { data } = await client.post('/api/v1/cart/recommend', {
    query,
    location: { lat, lng },
    radius_km: 5,
  });
  return data;
}
