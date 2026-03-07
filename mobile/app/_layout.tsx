import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocationWatcher } from '../hooks/useLocationWatcher';
import { useCartStore } from '../store/useCartStore';

const PURCHASE_HISTORY_KEY = 'ghost_cart_purchase_history';

// Starts the GPS polling loop for the whole app
function LocationWatcher() {
  useLocationWatcher();
  return null;
}

// Loads purchase history from AsyncStorage on mount and saves it back on every change
function PurchaseHistorySync() {
  const { purchaseHistory, setPurchaseHistory } = useCartStore();

  // Load saved history when the app opens
  useEffect(() => {
    AsyncStorage.getItem(PURCHASE_HISTORY_KEY).then((raw) => {
      if (raw) {
        try {
          setPurchaseHistory(JSON.parse(raw));
        } catch {
          // Corrupted storage — start fresh
        }
      }
    });
  }, []);

  // Save history to AsyncStorage whenever it changes
  useEffect(() => {
    if (purchaseHistory.length === 0) return; // Don't overwrite a loaded value with empty on init
    AsyncStorage.setItem(PURCHASE_HISTORY_KEY, JSON.stringify(purchaseHistory)).catch(
      () => {} // Silently fail — in-memory history still works for the session
    );
  }, [purchaseHistory]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <LocationWatcher />
      <PurchaseHistorySync />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
