import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'ghost_cart_onboarded';

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI chat bot',
    description:
      'Tell the bot what you need in plain English — it builds your shopping list automatically using Claude AI.',
  },
  {
    icon: '📍',
    title: 'Auto store detection',
    description:
      'The app checks your GPS every 30 seconds. Walk into a supported store and it adapts your list hands-free.',
  },
  {
    icon: '🗺️',
    title: 'Google Places auto-location',
    description:
      'On first launch, Ghost-Cart finds and maps every supported store near you automatically — no manual setup required.',
  },
  {
    icon: '🏪',
    title: 'Store-aware AI filtering',
    description:
      "Arrive at Walmart vs FreshCo and the AI hides items that store doesn't carry and shows what it does. Switch stores anytime with a tap.",
  },
  {
    icon: '✨',
    title: 'AI-suggested items',
    description:
      'When you enter a store, the AI adds "AI pick" items it thinks you might need based on your list and the store type.',
  },
  {
    icon: '✅',
    title: 'Smart list management',
    description:
      'Add items manually, check them off while you shop, clear done items in one tap, and see exactly how many items are hidden per store.',
  },
  {
    icon: '📡',
    title: 'Live GPS status',
    description:
      'A status banner on your list tells you whether the app is warming up, scanning for nearby stores, or has detected one.',
  },
];

export default function Index() {
  // null = still checking storage, true = show onboarding, false = skip to chat
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  // On mount, check if this user has already seen the onboarding screen
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
      setShowOnboarding(value === null); // null means first time
    });
  }, []);

  async function handleGetStarted() {
    // Save the flag so next time we skip straight to Chat
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(tabs)/chat');
  }

  // Still loading — show a blank screen briefly rather than a flash
  if (showOnboarding === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4F7FFF" />
      </View>
    );
  }

  // Not first time — redirect immediately
  if (!showOnboarding) {
    router.replace('/(tabs)/chat');
    return null;
  }

  // First time — show the welcome screen
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>🛒</Text>
          <Text style={styles.heroTitle}>Ghost-Cart</Text>
          <Text style={styles.heroSub}>Location-aware AI shopping assistant</Text>
        </View>

        {/* Feature list */}
        <View style={styles.featureList}>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.description}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* Sticky Get Started button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.ctaButton} onPress={handleGetStarted} activeOpacity={0.85}>
          <Text style={styles.ctaText}>Get Started →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scroll: {
    paddingBottom: 24,
  },

  // Hero section
  hero: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: 24,
    backgroundColor: '#4F7FFF',
  },
  heroIcon: { fontSize: 56, marginBottom: 12 },
  heroTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 16,
    color: '#C7D9FF',
    marginTop: 6,
    textAlign: 'center',
  },

  // Feature rows
  featureList: {
    padding: 24,
    gap: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  featureIcon: { fontSize: 28, marginTop: 2 },
  featureText: { flex: 1 },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },

  // Footer CTA
  footer: {
    padding: 20,
    paddingBottom: 8,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  ctaButton: {
    backgroundColor: '#4F7FFF',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
