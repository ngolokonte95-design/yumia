import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing } from '../../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';
const POLL_INTERVAL = 2000; // 2s polling pour simuler le temps réel

interface Message {
  id: string; conversationId: string; senderId: string;
  content: string; type: string; createdAt: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatRoomScreen() {
  const { id: convId } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const lastMsgDate = useRef<string>(new Date(0).toISOString());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    if (!accessToken || !convId) return;
    const res = await fetch(`${API}/chat/conversations/${convId}/messages?limit=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const msgs: Message[] = await res.json();
      setMessages(msgs);
      if (msgs.length) lastMsgDate.current = msgs[msgs.length - 1].createdAt;
    }
  }, [accessToken, convId]);

  const poll = useCallback(async () => {
    if (!accessToken || !convId) return;
    const res = await fetch(`${API}/chat/conversations/${convId}/messages/poll?after=${lastMsgDate.current}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const newMsgs: Message[] = await res.json();
      if (newMsgs.length) {
        setMessages((prev) => [...prev, ...newMsgs]);
        lastMsgDate.current = newMsgs[newMsgs.length - 1].createdAt;
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    }
  }, [accessToken, convId]);

  useEffect(() => {
    void loadHistory().then(() => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    });
    pollRef.current = setInterval(() => { void poll(); }, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadHistory, poll]);

  const send = async () => {
    if (!input.trim() || sending || !accessToken || !convId) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      const res = await fetch(`${API}/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages((prev) => [...prev, msg]);
        lastMsgDate.current = msg.createdAt;
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    } finally {
      setSending(false);
    }
  };

  const myId = user?.id ?? '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Chat</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item, index }) => {
            const isMe = item.senderId === myId;
            const prevMsg = messages[index - 1];
            const showDate = !prevMsg || new Date(item.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
            return (
              <>
                {showDate && (
                  <Text style={styles.dateSep}>
                    {new Date(item.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </Text>
                )}
                <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                    <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
                    <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{formatTime(item.createdAt)}</Text>
                  </View>
                </View>
              </>
            );
          }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Écris un message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
          />
          <Pressable style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]} onPress={send}>
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { fontSize: 22, color: colors.brand },
  title: { fontWeight: '700', fontSize: 17, color: colors.text },
  messageList: { padding: spacing.md },
  dateSep: { textAlign: 'center', fontSize: 12, color: colors.textMuted, marginVertical: 12 },
  msgRow: { flexDirection: 'row', marginBottom: 6 },
  msgRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '75%', borderRadius: radius.lg, padding: 10, paddingHorizontal: 14 },
  bubbleMe: { backgroundColor: colors.brand },
  bubbleOther: { backgroundColor: colors.surface },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: 'right' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },
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
