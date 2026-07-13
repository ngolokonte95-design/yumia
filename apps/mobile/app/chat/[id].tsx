import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, Image, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { useAuth } from '../../lib/auth-context';
import { encryptMessage, decryptMessage, getLocalPublicKey, isE2EAvailable } from '../../lib/e2e-crypto';
import { colors, radius, spacing } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';

const API = API_BASE_URL;
const POLL_INTERVAL = 2000;

interface Message {
  id: string; conversationId: string; senderId: string;
  content: string; type: string; audioUrl?: string; duration?: number;
  createdAt: string; senderPublicKey?: string;
  // type 'call' extras
  callType?: 'voice' | 'video'; callStatus?: 'missed' | 'answered' | 'declined'; callDuration?: number;
}

interface Partner {
  id: string; displayName: string; photoUrl?: string; e2ePublicKey?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function fmtSec(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmtDuration(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}

// ── Bulle vocale ──────────────────────────────────────────────────────────────
function VoiceBubble({ audioUrl, duration, isMe }: { audioUrl: string; duration?: number; isMe: boolean }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);

  const toggle = async () => {
    if (!sound) {
      const { sound: s } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true });
      s.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded) return;
        setPos(Math.floor((st.positionMillis ?? 0) / 1000));
        setTotal(Math.floor((st.durationMillis ?? 0) / 1000));
        if (st.didJustFinish) { setPlaying(false); setPos(0); }
      });
      setSound(s); setPlaying(true);
    } else if (playing) {
      await sound.pauseAsync(); setPlaying(false);
    } else {
      await sound.playAsync(); setPlaying(true);
    }
  };
  useEffect(() => () => { sound?.unloadAsync(); }, [sound]);
  const progress = total > 0 ? pos / total : 0;

  return (
    <Pressable onPress={toggle} style={[styles.voiceBubble, isMe && styles.voiceBubbleMe]}>
      <Text style={[styles.voicePlayIcon, isMe && { color: '#fff' }]}>{playing ? '⏸' : '▶'}</Text>
      <View style={styles.voiceWave}>
        <View style={[styles.voiceTrack, { backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : colors.border }]}>
          <View style={[styles.voiceFill, { width: `${progress * 100}%`, backgroundColor: isMe ? '#fff' : colors.brand }]} />
        </View>
      </View>
      <Text style={[styles.voiceTime, isMe && { color: 'rgba(255,255,255,0.75)' }]}>{fmtSec(playing ? pos : total)}</Text>
    </Pressable>
  );
}

// ── Bulle d'événement d'appel ─────────────────────────────────────────────────
function CallEventBubble({ msg, onCallback }: { msg: Message; onCallback: () => void }) {
  const isMissed = msg.callStatus === 'missed';
  const icon = msg.callType === 'video' ? '📹' : '📞';
  const label = isMissed
    ? `Appel ${msg.callType === 'video' ? 'vidéo' : 'vocal'} manqué`
    : `Appel ${msg.callType === 'video' ? 'vidéo' : 'vocal'} · ${fmtDuration(msg.callDuration ?? 0)}`;

  return (
    <View style={styles.callEvent}>
      <View style={styles.callEventRow}>
        <View style={[styles.callIconBox, isMissed && styles.callIconBoxMissed]}>
          <Text style={{ fontSize: 22 }}>{icon}</Text>
          {isMissed && <View style={styles.missedArrow}><Text style={{ color: '#E5484D', fontSize: 14 }}>↙</Text></View>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.callEventLabel, isMissed && styles.callEventLabelMissed]}>{label}</Text>
          <Text style={styles.callEventTime}>{formatTime(msg.createdAt)}</Text>
        </View>
      </View>
      {isMissed && (
        <Pressable style={styles.callbackBtn} onPress={onCallback}>
          <Text style={styles.callbackBtnTxt}>Rappeler</Text>
        </Pressable>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function ChatRoomScreen() {
  const { id: convId } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [decrypted, setDecrypted] = useState<Map<string, string>>(new Map());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [e2eActive, setE2eActive] = useState(false);

  const listRef = useRef<FlatList>(null);
  const lastMsgDate = useRef<string>(new Date(0).toISOString());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Chargement du partenaire ────────────────────────────────────────────
  const loadPartner = useCallback(async () => {
    if (!accessToken || !convId) return;
    try {
      const res = await fetch(`${API}/chat/conversations/${convId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json() as { participants?: Partner[]; partner?: Partner };
      const p = data.partner ?? data.participants?.find((u) => u.id !== user?.id) ?? null;
      setPartner(p);
      if (p?.e2ePublicKey && isE2EAvailable()) setE2eActive(true);
    } catch { /* silencieux */ }
  }, [accessToken, convId, user?.id]);

  // ─── Déchiffrement d'un batch de messages ────────────────────────────────
  const decryptBatch = useCallback(async (msgs: Message[]) => {
    if (!isE2EAvailable()) return;
    const updates = new Map<string, string>();
    for (const m of msgs) {
      if (m.type === 'encrypted' && m.senderPublicKey) {
        try {
          const plain = await decryptMessage(m.content, m.senderPublicKey);
          updates.set(m.id, plain);
        } catch { updates.set(m.id, '🔒 [message chiffré]'); }
      }
    }
    if (updates.size > 0) setDecrypted((prev) => new Map([...prev, ...updates]));
  }, []);

  // ─── Chargement de l'historique ──────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!accessToken || !convId) return;
    const res = await fetch(`${API}/chat/conversations/${convId}/messages?limit=80`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const msgs: Message[] = await res.json();
      setMessages(msgs);
      if (msgs.length) lastMsgDate.current = msgs[msgs.length - 1].createdAt;
      void decryptBatch(msgs);
    }
  }, [accessToken, convId, decryptBatch]);

  const poll = useCallback(async () => {
    if (!accessToken || !convId) return;
    const res = await fetch(
      `${API}/chat/conversations/${convId}/messages/poll?after=${encodeURIComponent(lastMsgDate.current)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) {
      const newMsgs: Message[] = await res.json();
      if (newMsgs.length) {
        setMessages((prev) => [...prev, ...newMsgs]);
        lastMsgDate.current = newMsgs[newMsgs.length - 1].createdAt;
        void decryptBatch(newMsgs);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    }
  }, [accessToken, convId, decryptBatch]);

  useEffect(() => {
    void loadPartner();
    void loadHistory().then(() => setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100));
    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadHistory, loadPartner, poll]);

  // ─── Envoi de message (chiffré si possible) ───────────────────────────────
  const send = async () => {
    if (!input.trim() || sending || !accessToken || !convId) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      let content = text;
      let type = 'text';
      let senderPublicKey: string | undefined;

      if (e2eActive && partner?.e2ePublicKey) {
        try {
          content = await encryptMessage(text, partner.e2ePublicKey);
          senderPublicKey = await getLocalPublicKey();
          type = 'encrypted';
        } catch { /* chiffrement échoué → plaintext */ }
      }

      const res = await fetch(`${API}/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ content, type, senderPublicKey }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        // Ajouter en clair localement (pas besoin de déchiffrer ce qu'on vient d'envoyer)
        const displayed = { ...msg, content: text };
        setMessages((prev) => [...prev, displayed]);
        if (type === 'encrypted') setDecrypted((prev) => new Map([...prev, [msg.id, text]]));
        lastMsgDate.current = msg.createdAt;
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    } finally {
      setSending(false);
    }
  };

  // ─── Vocal ────────────────────────────────────────────────────────────────
  const startVoice = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') return;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
    setIsRecordingVoice(true);
    setRecordingSeconds(0);
    recTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
  };

  const sendVoice = async () => {
    if (!recordingRef.current || !accessToken || !convId) return;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setIsRecordingVoice(false);
    const dur = recordingSeconds;
    setRecordingSeconds(0);
    await recordingRef.current.stopAndUnloadAsync();
    const uri = recordingRef.current.getURI();
    recordingRef.current = null;
    if (!uri) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as never);
      const up = await fetch(`${API}/posts/upload`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
      if (!up.ok) return;
      const { url } = await up.json() as { url: string };
      const res = await fetch(`${API}/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ content: '🎤 Message vocal', type: 'audio', audioUrl: url, duration: dur }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages((prev) => [...prev, msg]);
        lastMsgDate.current = msg.createdAt;
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      }
    } finally { setSending(false); }
  };

  const cancelVoice = async () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    await recordingRef.current?.stopAndUnloadAsync();
    recordingRef.current = null;
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  // ─── Appel ────────────────────────────────────────────────────────────────
  const startCall = (type: 'voice' | 'video') => {
    if (!partner) return;
    router.push(`/call?convId=${convId}&partnerId=${partner.id}&partnerName=${encodeURIComponent(partner.displayName)}&partnerPhoto=${encodeURIComponent(partner.photoUrl ?? '')}&type=${type}` as never);
  };

  const callback = () => startCall('voice');

  const myId = user?.id ?? '';

  const getDisplayContent = (msg: Message) => {
    if (msg.type === 'encrypted') return decrypted.get(msg.id) ?? '🔒';
    return msg.content;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backTxt}>←</Text>
        </Pressable>

        <Pressable style={styles.partnerInfo} onPress={() => partner && router.push(`/user/${partner.id}` as never)}>
          {partner?.photoUrl ? (
            <Image source={{ uri: partner.photoUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                {(partner?.displayName ?? '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View>
            <Text style={styles.partnerName}>{partner?.displayName ?? '...'}</Text>
            {e2eActive && <Text style={styles.encLabel}>🔐 Chiffré</Text>}
          </View>
        </Pressable>

        <View style={styles.headerActions}>
          <Pressable style={styles.headerActionBtn} onPress={() => startCall('voice')}>
            <Text style={styles.headerActionIcon}>📞</Text>
          </Pressable>
          <Pressable style={styles.headerActionBtn} onPress={() => startCall('video')}>
            <Text style={styles.headerActionIcon}>📹</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item, index }) => {
            const isMe = item.senderId === myId;
            const prev = messages[index - 1];
            const showDate = !prev || new Date(item.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
            const isAudio = item.type === 'audio' && item.audioUrl;
            const isCall = item.type === 'call';
            const isEnc = item.type === 'encrypted';

            return (
              <>
                {showDate && (
                  <Text style={styles.dateSep}>
                    {new Date(item.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
                  </Text>
                )}
                {isCall ? (
                  <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                    {isMe && <View style={styles.meBar} />}
                    <CallEventBubble msg={item} onCallback={callback} />
                  </View>
                ) : (
                  <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                    {isAudio ? (
                      <VoiceBubble audioUrl={item.audioUrl!} duration={item.duration} isMe={isMe} />
                    ) : (
                      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                        <Text style={[styles.bubbleTxt, isMe && styles.bubbleTxtMe]}>
                          {getDisplayContent(item)}
                        </Text>
                        <View style={styles.bubbleFooter}>
                          {(isEnc) && <Text style={[styles.encIcon, isMe && { color: 'rgba(255,255,255,0.5)' }]}>🔐</Text>}
                          <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{formatTime(item.createdAt)}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </>
            );
          }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {/* ── Barre d'enregistrement vocal ────────────────────────────────── */}
        {isRecordingVoice ? (
          <View style={[styles.voiceBar, { paddingBottom: insets.bottom + 8 }]}>
            <Pressable style={styles.voiceCancelBtn} onPress={cancelVoice}>
              <Text style={styles.voiceCancelTxt}>✕</Text>
            </Pressable>
            <View style={styles.voiceIndicator}>
              <View style={styles.voiceRecDot} />
              <Text style={styles.voiceRecTime}>{fmtSec(recordingSeconds)}</Text>
              <Text style={styles.voiceRecLabel}>En cours...</Text>
            </View>
            <Pressable style={styles.voiceSendBtn} onPress={sendVoice}>
              <Text style={{ fontSize: 22, color: '#fff' }}>↑</Text>
            </Pressable>
          </View>
        ) : (
          /* ── Barre de saisie ──────────────────────────────────────────── */
          <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
            <Pressable style={styles.inputIconBtn} onPress={() => router.push('/camera' as never)}>
              <Text style={{ fontSize: 22 }}>📷</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={e2eActive ? '🔐 Message chiffré...' : 'Écris un message...'}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
            />
            {input.trim() ? (
              <Pressable style={[styles.sendBtn, sending && styles.sendBtnDisabled]} onPress={send}>
                <Text style={styles.sendIcon}>↑</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.micBtn} onPressIn={startVoice}>
                <Text style={{ fontSize: 22 }}>🎤</Text>
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10,
  },
  backBtn: { padding: 4 },
  backTxt: { fontSize: 22, color: colors.brand },
  partnerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  partnerName: { fontSize: 16, fontWeight: '700', color: colors.text },
  encLabel: { fontSize: 11, color: colors.brand, fontWeight: '600', marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerActionBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 20 },
  headerActionIcon: { fontSize: 20 },

  // Messages
  messageList: { padding: spacing.md },
  dateSep: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginVertical: 14, fontWeight: '700', letterSpacing: 0.5 },
  msgRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  meBar: { width: 3, borderRadius: 2, backgroundColor: colors.brand, marginRight: 8, alignSelf: 'stretch' },
  bubble: { maxWidth: '75%', borderRadius: radius.lg, padding: 10, paddingHorizontal: 14 },
  bubbleMe: { backgroundColor: colors.brand },
  bubbleOther: { backgroundColor: colors.surface },
  bubbleTxt: { fontSize: 15, color: colors.text, lineHeight: 20 },
  bubbleTxtMe: { color: '#fff' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  encIcon: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  bubbleTime: { fontSize: 10, color: colors.textMuted },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.65)' },

  // Call event
  callEvent: { maxWidth: '85%', borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 4 },
  callEventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  callIconBox: { width: 48, height: 48, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  callIconBoxMissed: { backgroundColor: 'rgba(229,72,77,0.12)' },
  missedArrow: { position: 'absolute', bottom: 2, right: 2 },
  callEventLabel: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  callEventLabelMissed: { color: '#E5484D' },
  callEventTime: { fontSize: 12, color: colors.textMuted },
  callbackBtn: { marginHorizontal: 12, marginBottom: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 10, alignItems: 'center' },
  callbackBtnTxt: { fontWeight: '700', color: colors.text, fontSize: 14 },

  // Input
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: spacing.md, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  inputIconBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, color: colors.text, fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  micBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },

  // Voice bar
  voiceBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  voiceCancelBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  voiceCancelTxt: { fontSize: 20, color: colors.textMuted },
  voiceIndicator: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  voiceRecDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3040' },
  voiceRecTime: { fontSize: 16, fontWeight: '700', color: colors.text },
  voiceRecLabel: { fontSize: 13, color: colors.textMuted },
  voiceSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },

  // Voice bubble
  voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '75%', borderRadius: radius.lg, padding: 10, paddingHorizontal: 14, backgroundColor: colors.surface },
  voiceBubbleMe: { backgroundColor: colors.brand },
  voicePlayIcon: { fontSize: 20, color: colors.brand, width: 24, textAlign: 'center' },
  voiceWave: { flex: 1 },
  voiceTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  voiceFill: { height: '100%', borderRadius: 2 },
  voiceTime: { fontSize: 11, color: colors.textMuted, minWidth: 36, textAlign: 'right' },
});
