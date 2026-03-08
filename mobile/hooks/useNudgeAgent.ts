/**
 * useNudgeAgent.ts
 *
 * Orchestrates the agentic push-notification nudge loop.
 *
 * Trigger: app returns to foreground after 12+ hours in the background.
 * No background task manager or EAS build required — we use React Native's
 * AppState API and a timestamp stored in AsyncStorage.
 *
 * Flow:
 *   1. App goes background  → write LAST_FOREGROUND_KEY timestamp
 *   2. App returns active   → read timestamp, compute elapsed
 *   3. If elapsed >= 12h    → call runNudgeAgent()
 *   4. runNudgeAgent reads purchaseHistory + items from Zustand,
 *      derives daysSinceLastTrip, calls the gateway, and if Claude
 *      decides to notify → schedules an immediate local notification.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useCartStore } from '../store/useCartStore';
import { checkNudge } from '../services/api';

const LAST_FOREGROUND_KEY = 'ghost_cart_last_foreground_at';

// 12 hours in milliseconds — how long the app must be away before nudging
const BACKGROUND_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export function useNudgeAgent() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // Configure how notifications appear when the app is already open
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Request permission on first mount (no-op if already granted/denied)
    Notifications.requestPermissionsAsync().catch(() => {});

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  async function handleAppStateChange(nextState: AppStateStatus) {
    const prevState = appStateRef.current;
    appStateRef.current = nextState;

    if (nextState === 'background' || nextState === 'inactive') {
      // Record the moment the user left the app.
      // We write here (not just on read) so that even if the device
      // restarts, elapsed time is measured from the actual last session.
      await AsyncStorage.setItem(LAST_FOREGROUND_KEY, Date.now().toString()).catch(() => {});
      return;
    }

    if (nextState === 'active' && prevState !== 'active') {
      // App just came to foreground — check if enough time has passed
      try {
        const raw = await AsyncStorage.getItem(LAST_FOREGROUND_KEY);

        if (raw === null) {
          // First ever launch — record timestamp but do not nudge yet
          await AsyncStorage.setItem(LAST_FOREGROUND_KEY, Date.now().toString()).catch(() => {});
          return;
        }

        const lastBackgroundAt = parseInt(raw, 10);
        const elapsed = Date.now() - lastBackgroundAt;

        // Update timestamp so next foreground cycle starts fresh
        await AsyncStorage.setItem(LAST_FOREGROUND_KEY, Date.now().toString()).catch(() => {});

        if (elapsed < BACKGROUND_THRESHOLD_MS) {
          console.log(
            `[NudgeAgent] Skipping check — only ${(elapsed / 3_600_000).toFixed(1)}h elapsed`
          );
          return;
        }

        console.log(
          `[NudgeAgent] App back after ${(elapsed / 3_600_000).toFixed(1)}h — running nudge agent`
        );
        await runNudgeAgent();
      } catch (err) {
        // Silent fail — a missed nudge is better than a crash
        console.warn('[NudgeAgent] AppState handler error:', err);
      }
    }
  }

  async function runNudgeAgent() {
    try {
      const { purchaseHistory, items } = useCartStore.getState();

      if (purchaseHistory.length === 0) {
        console.log('[NudgeAgent] No purchase history yet — skipping');
        return;
      }

      // Derive days since last trip from the most recent purchase across all records
      const maxLastBoughtAt = Math.max(...purchaseHistory.map((r) => r.lastBoughtAt));
      const daysSinceLastTrip = (Date.now() - maxLastBoughtAt) / (1000 * 60 * 60 * 24);

      const historyPayload = purchaseHistory.map((r) => ({
        name: r.name,
        last_bought_at_ms: r.lastBoughtAt,
        store_where: r.storeWhere,
        count: r.count,
      }));

      const currentListNames = items.map((i) => i.name);

      console.log(
        `[NudgeAgent] Calling brain — ${purchaseHistory.length} history items, ` +
        `${currentListNames.length} on list, ${daysSinceLastTrip.toFixed(1)} days since last trip`
      );

      const result = await checkNudge(historyPayload, currentListNames, daysSinceLastTrip);

      if (result.action === 'send') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: result.title,
            body: result.body,
            data: {
              urgency: result.urgency,
              suggested_items: result.suggested_items,
              source: 'nudge_agent',
            },
          },
          trigger: null, // Fire immediately — decision was made server-side
        });
        console.log(
          `[NudgeAgent] Notification sent: "${result.title}" (urgency=${result.urgency})`
        );
      } else {
        console.log(`[NudgeAgent] Nudge skipped: ${result.reason}`);
      }
    } catch (err) {
      // Silent fail — a missed nudge is better than crashing the app
      console.warn('[NudgeAgent] runNudgeAgent error:', err);
    }
  }
}
