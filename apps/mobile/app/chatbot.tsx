import { useCallback, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Où sortir ce soir à Paris ?',
  'Propose-moi un lieu romantique',
  'J\'ai faim, quoi de bon ?',
  'Activité cool pour ce weekend',
];

export default function ChatbotScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([{
    role: 'assistant',
    content: 'Salut ! Je suis YUMIA Assistant 👋 Dis-moi ce que tu cherches — un resto, une sortie, une activité — et je te trouve ce qu\'il te faut !',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: text };
    const history = messages.slice(-10);
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const res = await fetch(`${API}/chatbot/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ message: text, history }),
      });
      if (res.ok) {
        const data = await res.json() as { reply: string };
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Oups, un problème est survenu 😕' }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, loading, accessToken]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>🤖</Text>
          <View>
            <Text style={styles.headerTitle}>YUMIA Assistant</Text>
            <Text style={styles.headerSub}>Ton copilote d'expériences</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
              {item.role === 'assistant' && <Text style={styles.botEmoji}>🤖</Text>}
              <View style={[styles.bubbleContent, item.role === 'user' ? styles.bubbleContentUser : styles.bubbleContentBot]}>
                <Text style={[styles.bubbleText, item.role === 'user' && styles.bubbleTextUser]}>{item.content}</Text>
              </View>
            </View>
          )}
          ListFooterComponent={loading ? (
            <View style={styles.typing}>
              <Text style={styles.typingDots}>●●●</Text>
            </View>
          ) : null}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Quick suggestions */}
        {messages.length === 1 && (
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} style={styles.suggestionChip} onPress={() => send(s)}>
                <Text style={styles.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Input */}
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Dis-moi ce que tu cherches..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            onSubmitEditing={() => send(input)}
          />
          <Pressable style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]} onPress={() => send(input)}>
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { marginRight: 8 },
  backBtnText: { fontSize: 22, color: colors.brand },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { fontSize: 28 },
  headerTitle: { ...typography.h3, color: colors.text },
  headerSub: { fontSize: 12, color: colors.textMuted },
  messageList: { padding: spacing.md, paddingBottom: 16 },
  bubble: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleBot: { justifyContent: 'flex-start', gap: 6 },
  botEmoji: { fontSize: 20, marginBottom: 2 },
  bubbleContent: { maxWidth: '80%', borderRadius: radius.lg, padding: 12 },
  bubbleContentBot: { backgroundColor: colors.surface },
  bubbleContentUser: { backgroundColor: colors.brand },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  bubbleTextUser: { color: '#fff' },
  typing: { paddingLeft: spacing.md, paddingBottom: 8 },
  typingDots: { color: colors.textMuted, fontSize: 18, letterSpacing: 4 },
  suggestions: { paddingHorizontal: spacing.md, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: { backgroundColor: colors.brand + '22', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  suggestionText: { color: colors.brand, fontSize: 13, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: spacing.md, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 12, color: colors.text, fontSize: 15, maxHeight: 100,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
