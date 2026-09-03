import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import type { Plan } from '../../lib/feed-api';
import { Avatar, PlanBadgeIcon } from '../../components/Avatar';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';

const API = API_BASE_URL;

interface Conversation {
  id: string;
  isGroup?: boolean;
  title?: string | null;
  photoUrl?: string | null;
  participantsCount?: number;
  otherUser: { id: string; displayName: string; photoUrl?: string; plan?: Plan | null } | null;
  lastMessage: { content: string; senderId: string; createdAt: string } | null;
  updatedAt: string;
}

interface UserNote {
  id: string;
  userId: string;
  text: string;
  user: { id: string; displayName: string; photoUrl?: string; plan?: Plan | null } | null;
}

function formatAgo(iso: string, t: (key: TranslationKey) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('ci_now');
  if (m < 60) return `${m}${t('social_time_min')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}${t('social_time_hour')}`;
  return `${Math.floor(h / 24)}${t('social_time_day')}`;
}

export default function ChatListScreen() {
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    const [convRes, notesRes] = await Promise.allSettled([
      fetch(`${API}/chat/conversations`, { headers: h }),
      fetch(`${API}/social/notes`, { headers: h }),
    ]);
    if (convRes.status === 'fulfilled' && convRes.value.ok) setConversations(await convRes.value.json());
    if (notesRes.status === 'fulfilled' && notesRes.value.ok) setNotes(await notesRes.value.json());
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const myNote = notes.find((n) => n.userId === me?.id);
  const otherNotes = notes.filter((n) => n.userId !== me?.id);

  const saveNote = async () => {
    if (!accessToken) return;
    if (!noteText.trim()) {
      // Texte vide → supprime la note existante.
      await fetch(`${API}/social/note`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
    } else {
      const res = await fetch(`${API}/social/note`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ text: noteText.trim() }),
      });
      if (!res.ok) { Alert.alert(t('ci_error'), t('ci_note_save_error')); return; }
    }
    setNoteModal(false);
    void load();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>{t('ci_title')}</Text>
        <Pressable onPress={() => router.push('/(tabs)/social')}>
          <Text style={styles.newBtn}>+</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={
            /* ── Notes (statut 24h, façon Instagram) ─────────────────────── */
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginVertical: 10 }}
              contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 14 }}
            >
              {/* Ma note */}
              <Pressable style={styles.noteItem} onPress={() => { setNoteText(myNote?.text ?? ''); setNoteModal(true); }}>
                {myNote ? (
                  <View style={styles.noteBubble}><Text style={styles.noteBubbleTxt} numberOfLines={2}>{myNote.text}</Text></View>
                ) : (
                  <View style={styles.noteBubble}><Text style={[styles.noteBubbleTxt, { color: colors.textMuted }]}>{t('ci_your_note_placeholder')}</Text></View>
                )}
                {me?.photoUrl ? (
                  <Image source={{ uri: me.photoUrl }} style={styles.noteAvatar} />
                ) : (
                  <View style={[styles.noteAvatar, styles.noteAvatarFallback]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{(me?.displayName ?? 'M')[0]}</Text>
                  </View>
                )}
                <Text style={styles.noteName} numberOfLines={1}>{t('ci_your_note')}</Text>
              </Pressable>

              {/* Notes des gens que je suis */}
              {otherNotes.map((n) => (
                <Pressable key={n.id} style={styles.noteItem} onPress={() => n.user && router.push(`/user/${n.user.id}` as never)}>
                  <View style={styles.noteBubble}><Text style={styles.noteBubbleTxt} numberOfLines={2}>{n.text}</Text></View>
                  {n.user?.photoUrl ? (
                    <Image source={{ uri: n.user.photoUrl }} style={styles.noteAvatar} />
                  ) : (
                    <View style={[styles.noteAvatar, styles.noteAvatarFallback]}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{n.user?.displayName?.[0] ?? '?'}</Text>
                    </View>
                  )}
                  <Text style={styles.noteName} numberOfLines={1}>{n.user?.displayName?.split(' ')[0]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          }
          renderItem={({ item }) => {
            const isGroup = item.isGroup;
            const name = isGroup ? (item.title ?? t('ci_group_default')) : (item.otherUser?.displayName ?? t('ci_unknown'));
            const photo = isGroup ? item.photoUrl : item.otherUser?.photoUrl;
            return (
              <Pressable style={styles.convRow} onPress={() => router.push(`/chat/${item.id}`)}>
                <Avatar
                  uri={photo}
                  size={52}
                  placeholderColor={colors.brand}
                  fallback={
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>
                      {isGroup ? '👥' : name[0]}
                    </Text>
                  }
                />
                <View style={styles.convBody}>
                  <View style={styles.convTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                      <Text style={styles.convName}>
                        {name}{isGroup && item.participantsCount ? `  ·  ${item.participantsCount}` : ''}
                      </Text>
                      {!isGroup && <PlanBadgeIcon plan={item.otherUser?.plan} size={32} />}
                    </View>
                    <Text style={styles.convTime}>{formatAgo(item.updatedAt, t)}</Text>
                  </View>
                  <Text style={styles.convLast} numberOfLines={1}>
                    {item.lastMessage?.content ?? t('ci_new_conversation')}
                  </Text>
                </View>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyTitle}>{t('ci_empty_title')}</Text>
              <Text style={styles.emptyText}>{t('ci_empty_text')}</Text>
            </View>
          }
        />
      )}

      {/* ── Modal ma note ──────────────────────────────────────────────────── */}
      <Modal visible={noteModal} transparent animationType="slide" onRequestClose={() => setNoteModal(false)}>
        <Pressable style={styles.noteOverlay} onPress={() => setNoteModal(false)}>
          <Pressable style={styles.noteSheet} onPress={() => {}}>
            <Text style={styles.noteSheetTitle}>{t('ci_note_title')}</Text>
            <TextInput
              style={styles.noteInput}
              placeholder={t('ci_note_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={noteText}
              onChangeText={setNoteText}
              maxLength={60}
              autoFocus
            />
            <Text style={styles.noteCount}>{noteText.length}/60</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {myNote ? (
                <Pressable style={styles.noteDeleteBtn} onPress={() => { setNoteText(''); void saveNote(); }}>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>{t('ci_delete')}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.noteSaveBtn} onPress={() => void saveNote()}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('ci_share')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text },
  newBtn: { fontSize: 26, color: colors.brand, fontWeight: '300' },
  convRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  convBody: { flex: 1 },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  convName: { fontWeight: '700', color: colors.text, fontSize: 15 },
  convTime: { fontSize: 12, color: colors.textMuted },
  convLast: { fontSize: 14, color: colors.textMuted },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 76 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted },
  // Notes
  noteItem: { alignItems: 'center', width: 76 },
  noteBubble: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 8, paddingVertical: 6, marginBottom: -6, zIndex: 2, maxWidth: 82, minHeight: 32,
  },
  noteBubbleTxt: { fontSize: 10, color: colors.text, textAlign: 'center' },
  noteAvatar: { width: 56, height: 56, borderRadius: 28 },
  noteAvatarFallback: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  noteName: { fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  noteOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  noteSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40, gap: 10 },
  noteSheetTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  noteInput: { backgroundColor: colors.background, borderRadius: radius.lg, padding: 12, color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border },
  noteCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right' },
  noteDeleteBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  noteSaveBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.brand },
});
