import { useEffect, useRef } from 'react';
import { useCartStore } from '../store/useCartStore';
import {
  requestLocationPermission,
  getCurrentPosition,
  findNearbyStore,
  POLL_INTERVAL_MS,
} from '../services/location';
import { processIntent, checkRestock } from '../services/api';
import { lookupStoreLocations } from '../services/storeLookup';

/**
 * Starts a 30-second location polling loop when the app opens.
 *
 * Each tick:
 * 1. Gets the phone's GPS position
 * 2. On the FIRST fix, calls Google Places to auto-locate all supported stores
 * 3. Checks if the user is within range of any saved store
 * 4. On NEW store entry → fires TWO things in parallel:
 *    a. processIntent   — filters + hides items for this store type
 *    b. runRestockAgent — Claude autonomously decides which past items to add back
 * 5. On store exit → resets to "no store selected", unhides all items
 */
export function useLocationWatcher() {
  const {
    setUserCoords,
    setNearbyStore,
    setSelectedStore,
    setItems,
    setBotNote,
    saveStoreLocation,
    addItem,
  } = useCartStore();

  const lastDetectedStoreName = useRef<string | null>(null);
  const permissionGranted = useRef(false);
  const hasRunLookup = useRef(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function init() {
      permissionGranted.current = await requestLocationPermission();
      if (!permissionGranted.current) return;

      await checkLocation();
      interval = setInterval(checkLocation, POLL_INTERVAL_MS);
    }

    async function checkLocation() {
      if (!permissionGranted.current) return;

      const coords = await getCurrentPosition();
      if (!coords) return;

      setUserCoords(coords);

      // Auto-locate stores via Google Places (runs ONCE per session)
      if (!hasRunLookup.current) {
        hasRunLookup.current = true;
        autoLocateStores(coords);
      }

      const currentStores = useCartStore.getState().stores;
      const detected = findNearbyStore(coords, currentStores);

      if (detected && detected.name !== lastDetectedStoreName.current) {
        lastDetectedStoreName.current = detected.name;
        setNearbyStore(detected);
        setSelectedStore(detected);

        const currentItems = useCartStore.getState().items;
        // Exclude AI-added items from the list we send — only user-added items matter
        const userItems = currentItems
          .filter((i) => !i.suggested && !i.restocked)
          .map((i) => i.name);

        setBotNote(`📍 You're near ${detected.name} — checking your list…`);

        // Fire both in parallel — they're independent of each other
        await Promise.all([
          runIntentFilter(detected, currentItems, userItems),
          runRestockAgent(detected, currentItems.map((i) => i.name)),
        ]);

      } else if (!detected && lastDetectedStoreName.current !== null) {
        lastDetectedStoreName.current = null;
        setNearbyStore(null);
        setSelectedStore(useCartStore.getState().stores[0]);
        setBotNote(null);

        const currentItems = useCartStore.getState().items;
        setItems(currentItems.map((i) => ({ ...i, hidden: false })));
      }
    }

    // ── processIntent: hides/surfaces items based on what the store carries ──
    async function runIntentFilter(
      store: { name: string; type: string },
      currentItems: ReturnType<typeof useCartStore.getState>['items'],
      userItems: string[]
    ) {
      if (userItems.length === 0) return;

      try {
        const result = await processIntent(store, userItems);

        const hiddenSet = new Set(result.items_to_hide.map((n: string) => n.toLowerCase()));
        const updated = currentItems.map((item) => ({
          ...item,
          hidden: hiddenSet.has(item.name.toLowerCase()),
        }));

        const suggestions = (result.suggested_items || []).map((name: string) => ({
          id: `suggest-${Date.now()}-${name}`,
          name,
          checked: false,
          hidden: false,
          suggested: true,
          restocked: false,
        }));

        setItems([...updated, ...suggestions]);
        setBotNote(result.reasoning);
      } catch {
        setBotNote(`📍 Near ${store.name} — couldn't filter list (server offline?)`);
      }
    }

    // ── Restock agent: Claude autonomously adds items from purchase history ──
    async function runRestockAgent(
      store: { name: string; type: string },
      currentListNames: string[]
    ) {
      try {
        const { purchaseHistory } = useCartStore.getState();
        if (purchaseHistory.length === 0) return; // No history yet

        const historyPayload = purchaseHistory.map((r) => ({
          name: r.name,
          last_bought_at_ms: r.lastBoughtAt,
          store_where: r.storeWhere,
          count: r.count,
        }));

        const result = await checkRestock(store, currentListNames, historyPayload);

        for (const item of result.items_to_add) {
          console.log(`[RestockAgent] Adding: ${item.name} — ${item.reason}`);
          addItem(item.name, false, true); // suggested=false, restocked=true
        }

        if (result.agent_note && result.items_to_add.length > 0) {
          setBotNote(result.agent_note);
        }
      } catch (err) {
        console.warn('[RestockAgent] Failed (will retry next store visit):', err);
      }
    }

    // ── Google Places auto-locate (fires once on first GPS fix) ─────────────
    async function autoLocateStores(coords: { lat: number; lng: number }) {
      try {
        const currentStores = useCartStore.getState().stores;
        const namesToLookup = currentStores
          .filter((s) => s.type !== 'none' && !s.coords)
          .map((s) => s.name);

        if (namesToLookup.length === 0) return;

        console.log(`[StoreLookup] Auto-locating: ${namesToLookup.join(', ')}`);
        const results = await lookupStoreLocations(coords, namesToLookup);

        results.forEach(({ name, coords: storeCoords }) => {
          if (storeCoords) {
            console.log(`[StoreLookup] Auto-located: ${name} @ ${storeCoords.lat.toFixed(5)}, ${storeCoords.lng.toFixed(5)}`);
            saveStoreLocation(name, storeCoords);
          } else {
            console.log(`[StoreLookup] Not found nearby: ${name}`);
          }
        });
      } catch (err) {
        console.warn('[StoreLookup] Auto-locate failed:', err);
      }
    }

    init();
    return () => clearInterval(interval);
  }, []);
}
