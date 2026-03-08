import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore, STORES, CartItem } from '../../store/useCartStore';
import { processIntent } from '../../services/api';

export default function ListScreen() {
  const {
    items,
    addItem,
    removeItem,
    toggleItem,
    setItems,
    clearChecked,
    selectedStore,
    setSelectedStore,
    botNote,
    setBotNote,
    stores,
    userCoords,
    nearbyStore,
    saveStoreLocation,
  } = useCartStore();

  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(false);

  // Saves the user's current GPS position as this store's location
  function handleImHere(storeName: string) {
    if (!userCoords) {
      Alert.alert(
        'No GPS signal',
        "The app hasn't picked up your location yet. Wait a moment and try again.",
      );
      return;
    }
    saveStoreLocation(storeName, userCoords);
    Alert.alert(
      '📍 Location saved!',
      `Ghost-Cart will now detect when you're near ${storeName} and filter your list automatically.`,
    );
  }

  // When the user taps a store chip, call the AI to filter the list
  async function handleStoreChange(store: typeof STORES[0]) {
    setSelectedStore(store);
    setBotNote(null);

    if (store.type === 'none' || items.length === 0) {
      setItems(items.map((i) => ({ ...i, hidden: false })));
      return;
    }

    setLoading(true);
    try {
      const visibleItemNames = items.filter((i) => !i.suggested).map((i) => i.name);
      const result = await processIntent(store, visibleItemNames);

      const hiddenSet = new Set(result.items_to_hide.map((n) => n.toLowerCase()));
      const updated = items.map((item) => ({
        ...item,
        hidden: hiddenSet.has(item.name.toLowerCase()),
      }));

      const suggestions: CartItem[] = (result.suggested_items || []).map((name) => ({
        id: `suggest-${Date.now()}-${name}`,
        name,
        checked: false,
        hidden: false,
        suggested: true,
      }));

      setItems([...updated, ...suggestions]);
      setBotNote(result.reasoning);
    } catch {
      setBotNote('Could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  function handleAddItem() {
    const name = newItem.trim();
    if (!name) return;
    addItem(name);
    setNewItem('');
  }

  const visibleItems = items.filter((i) => !i.hidden);
  const hiddenCount = items.filter((i) => i.hidden).length;

  // GPS status banner content — derived from Zustand state set by useLocationWatcher
  function renderGpsBanner() {
    if (!userCoords) {
      return (
        <View style={[styles.gpsBanner, styles.gpsBannerIdle]}>
          <ActivityIndicator size="small" color="#6B7280" style={{ marginRight: 8 }} />
          <Text style={styles.gpsBannerTextIdle}>Waiting for GPS signal…</Text>
        </View>
      );
    }
    if (nearbyStore) {
      return (
        <View style={[styles.gpsBanner, styles.gpsBannerActive]}>
          <View style={styles.gpsDot} />
          <Text style={styles.gpsBannerTextActive}>
            Near {nearbyStore.name} — list is being filtered
          </Text>
        </View>
      );
    }
    return (
      <View style={[styles.gpsBanner, styles.gpsBannerIdle]}>
        <Ionicons name="navigate-outline" size={14} color="#6B7280" style={{ marginRight: 6 }} />
        <Text style={styles.gpsBannerTextIdle}>Scanning for nearby stores…</Text>
      </View>
    );
  }

  function renderItem({ item }: { item: CartItem }) {
    return (
      <TouchableOpacity
        style={[styles.itemRow, item.checked && styles.itemChecked]}
        onPress={() => toggleItem(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
          {item.checked && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
          {item.name}
        </Text>
        {item.suggested && !item.restocked && (
          <View style={styles.suggestedBadge}>
            <Text style={styles.suggestedText}>AI pick</Text>
          </View>
        )}
        {item.restocked && (
          <View style={styles.restockedBadge}>
            <Text style={styles.restockedText}>restock</Text>
          </View>
        )}
        <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={18} color="#D1D5DB" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My List</Text>
        {items.some((i) => i.checked) && (
          <TouchableOpacity onPress={clearChecked}>
            <Text style={styles.clearBtn}>Clear done</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

        {/* GPS status banner */}
        {renderGpsBanner()}

        {/* Store picker */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>📍 I'm at</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storeRow}>
            {stores.map((store) => {
              const hasLocation = !!store.coords;
              const isActive = selectedStore.name === store.name;
              return (
                <View key={store.name} style={styles.chipWrapper}>
                  {/* Store chip */}
                  <TouchableOpacity
                    style={[styles.storeChip, isActive && styles.storeChipActive]}
                    onPress={() => handleStoreChange(store)}
                  >
                    {/* Green dot = location known (auto-located or manually saved) */}
                    {hasLocation && <View style={styles.savedDot} />}
                    <Text
                      style={[
                        styles.storeChipText,
                        isActive && styles.storeChipTextActive,
                      ]}
                    >
                      {store.name}
                    </Text>
                  </TouchableOpacity>

                  {/* Manual "I'm here" button — fallback / override for real stores */}
                  {store.type !== 'none' && (
                    <TouchableOpacity
                      style={styles.imHereBtn}
                      onPress={() => handleImHere(store.name)}
                    >
                      <Ionicons name="location" size={12} color="#4F7FFF" />
                      {/* Label changes to "Update" once a location is already saved */}
                      <Text style={styles.imHereText}>
                        {hasLocation ? 'Update' : "I'm here"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* AI bot note */}
        {loading && (
          <View style={styles.botNote}>
            <ActivityIndicator size="small" color="#4F7FFF" />
            <Text style={styles.botNoteText}>Filtering your list for this store…</Text>
          </View>
        )}
        {!loading && botNote && (
          <View style={styles.botNote}>
            <Text style={styles.botNoteIcon}>🤖</Text>
            <Text style={styles.botNoteText}>{botNote}</Text>
          </View>
        )}

        {/* Hidden items notice */}
        {hiddenCount > 0 && (
          <View style={styles.hiddenNote}>
            <Ionicons name="eye-off-outline" size={15} color="#9CA3AF" />
            <Text style={styles.hiddenNoteText}>
              {hiddenCount} item{hiddenCount > 1 ? 's' : ''} hidden — not available at {selectedStore.name}
            </Text>
          </View>
        )}

        {/* Shopping list */}
        {visibleItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🛒</Text>
            <Text style={styles.emptyTitle}>Your list is empty</Text>
            <Text style={styles.emptyBody}>
              Add items below or chat with the bot to build your list automatically.
            </Text>
          </View>
        ) : (
          <FlatList
            data={visibleItems}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            scrollEnabled={false}
            contentContainerStyle={styles.listContent}
          />
        )}

      </ScrollView>

      {/* Add item bar */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Add an item..."
          placeholderTextColor="#9CA3AF"
          value={newItem}
          onChangeText={setNewItem}
          onSubmitEditing={handleAddItem}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addBtn, !newItem.trim() && styles.addBtnDisabled]}
          onPress={handleAddItem}
          disabled={!newItem.trim()}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#4F7FFF',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  clearBtn: { color: '#C7D9FF', fontSize: 14 },

  // GPS banner
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gpsBannerIdle: { backgroundColor: '#F3F4F6' },
  gpsBannerActive: { backgroundColor: '#D1FAE5' },
  gpsBannerTextIdle: { fontSize: 12, color: '#6B7280' },
  gpsBannerTextActive: { fontSize: 12, color: '#065F46', fontWeight: '600' },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 8,
  },

  section: { paddingTop: 16, paddingHorizontal: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 8 },

  storeRow: { flexDirection: 'row', marginBottom: 4 },

  // Wrapper holds the chip + "I'm here" label stacked vertically
  chipWrapper: {
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    gap: 5,
  },
  storeChipActive: { backgroundColor: '#4F7FFF' },
  storeChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  storeChipTextActive: { color: '#fff' },

  // Small green dot shown inside the chip when GPS coords are saved
  savedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },

  // "I'm here" tap target below each store chip
  imHereBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imHereText: { fontSize: 11, color: '#4F7FFF', fontWeight: '500' },

  botNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  botNoteIcon: { fontSize: 16 },
  botNoteText: { flex: 1, fontSize: 13, color: '#3730A3', lineHeight: 19 },

  hiddenNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
  },
  hiddenNoteText: { fontSize: 12, color: '#9CA3AF' },

  listContent: { padding: 16 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  itemChecked: { opacity: 0.5 },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#4F7FFF', borderColor: '#4F7FFF' },

  itemName: { flex: 1, fontSize: 16, color: '#111827' },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#9CA3AF' },

  suggestedBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  suggestedText: { fontSize: 11, color: '#92400E', fontWeight: '600' },

  // Restock agent badge — amber, distinct from the yellow "AI pick"
  restockedBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#F97316',
  },
  restockedText: { fontSize: 11, color: '#C2410C', fontWeight: '600' },

  deleteBtn: { padding: 4 },

  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21 },

  addRow: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 10,
    alignItems: 'center',
  },
  addInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F7FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { backgroundColor: '#C7D9FF' },
});
