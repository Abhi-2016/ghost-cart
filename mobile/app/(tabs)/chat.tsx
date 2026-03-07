import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore, ChatMessage } from '../../store/useCartStore';
import { getRecommendations } from '../../services/api';

export default function ChatScreen() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { messages, addMessage, addItem } = useCartStore();

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    addMessage('user', text);
    setLoading(true);

    try {
      // Send the user's message to our gateway, get AI recommendations back
      const result = await getRecommendations(text);

      // Add each suggested item to the shared shopping list automatically
      result.items.forEach((item: any) => addItem(item.name));

      // Build a friendly reply summarising what was added
      const itemNames = result.items.map((i: any) => i.name).join(', ');
      const reply = itemNames
        ? `Got it! I've added these to your list: **${itemNames}**.\n\n_${result.reasoning}_`
        : "I couldn't find specific items for that. Try being more specific, like \"high protein breakfast\" or \"pasta ingredients\".";

      addMessage('bot', reply);
    } catch (err) {
      addMessage(
        'bot',
        'Sorry, I had trouble connecting to the server. Make sure your gateway is running on port 3000.'
      );
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  function renderMessage({ item }: { item: ChatMessage }) {
    const isBot = item.role === 'bot';
    return (
      <View style={[styles.bubble, isBot ? styles.botBubble : styles.userBubble]}>
        {isBot && (
          <View style={styles.botAvatar}>
            <Text style={styles.botAvatarText}>🛒</Text>
          </View>
        )}
        <View style={[styles.bubbleBody, isBot ? styles.botBody : styles.userBody]}>
          <Text style={[styles.bubbleText, isBot ? styles.botText : styles.userText]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ghost-Cart</Text>
        <Text style={styles.headerSub}>Your AI shopping assistant</Text>
      </View>

      {/* Chat messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Typing indicator */}
      {loading && (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color="#4F7FFF" />
          <Text style={styles.typingText}>Ghost-Cart is thinking…</Text>
        </View>
      )}

      {/* Input bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. pasta ingredients for 4..."
            placeholderTextColor="#9CA3AF"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!loading}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    backgroundColor: '#4F7FFF',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerSub: { color: '#C7D9FF', fontSize: 13, marginTop: 2 },

  messageList: { padding: 16, paddingBottom: 8 },

  bubble: { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-end' },
  botBubble: { justifyContent: 'flex-start' },
  userBubble: { justifyContent: 'flex-end' },

  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8EEFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  botAvatarText: { fontSize: 16 },

  bubbleBody: { maxWidth: '78%', borderRadius: 16, padding: 12 },
  botBody: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  userBody: { backgroundColor: '#4F7FFF', borderBottomRightRadius: 4 },

  bubbleText: { fontSize: 15, lineHeight: 21 },
  botText: { color: '#111827' },
  userText: { color: '#fff' },

  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
  },
  typingText: { color: '#6B7280', fontSize: 13 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F7FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#C7D9FF' },
});
