/**
 * Messagerie — liste des conversations.
 *
 * Mise en scène (17/11/2026) : fond profond uni, grand titre, avatars à
 * anneau au dégradé de marque pour les conversations non lues, aperçu clair
 * du dernier message, apparition en cascade. Logique inchangée.
 */
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, elevation, radius, spacing } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import type { Plan } from '../../lib/feed-api';
import { Avatar, PlanBadgeIcon } from '../../components/Avatar';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';
import { FeatureTip } from '../../components/FeatureTip';
import { PressableScale, Reveal } from '../../components/ui';
import {
  BrandFill, CHAT_BG, CHAT_GLASS, CHAT_HAIRLINE, GlassCircle, GradientRing, ringInner,
} from '../../components/chat/ChatChrome';

const API = API_BASE_URL;

/** Diamètre de l'anneau d'avatar d'une conversation. */
const ROW_RING = 58;
/** Diamètre de l'anneau d'avatar d'une note. */
const NOTE_RING = 62;
/** Au-delà, plus de cascade : ces lignes apparaissent hors écran. */
const CASCADE_MAX = 10;

interface Conversation {
  id: string;
  isGroup?: boolean;
  title?: string | null;
  photoUrl?: string | null;
  participantsCount?: number;
  otherUser: { id: string; displayName: string; photoUrl?: string; plan?: Plan | null } | null;
  lastMessage: {
    content: string; senderId: string; createdAt: string;
    type?: string; callStatus?: string | null;
  } | null;
  /** Dernière lecture de CETTE conversation par MOI — sert à calculer le non-lu. */
  lastReadAt: string | null;
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

/** Initiale (ou emoji) affichée quand il n'y a pas de photo. */
function Initial({ text, size }: { text: string; size: number }) {
  return <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{text}</Text>;
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

  // Recharge à chaque retour sur cet écran (pas juste au montage) : lire une
  // conversation marque sa lecture côté serveur (voir chat.service.ts), il
  // faut donc rafraîchir la liste en revenant pour que le repère « non lu »
  // disparaisse — un simple useEffect au montage ne le referait jamais.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

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

  const noteAvatarSize = ringInner(NOTE_RING);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── En-tête : retour en verre, grand titre, nouveau message ──────── */}
      <View style={styles.header}>
        <GlassCircle onPress={() => router.back()}>
          <Text style={styles.headerIcon}>←</Text>
        </GlassCircle>
        <Text style={styles.title} numberOfLines={1}>{t('ci_title')}</Text>
        <PressableScale style={styles.newBtn} onPress={() => router.push('/chat/new' as never)} scaleTo={0.9} hitSlop={8} haptic>
          <BrandFill />
          <Text style={styles.newBtnTxt}>+</Text>
        </PressableScale>
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
              style={styles.notesScroll}
              contentContainerStyle={styles.notesRow}
            >
              {/* Ma note */}
              <PressableScale style={styles.noteItem} onPress={() => { setNoteText(myNote?.text ?? ''); setNoteModal(true); }}>
                <View style={styles.noteBubble}>
                  <Text style={[styles.noteBubbleTxt, !myNote && { color: colors.textMuted }]} numberOfLines={2}>
                    {myNote ? myNote.text : t('ci_your_note_placeholder')}
                  </Text>
                </View>
                <GradientRing size={NOTE_RING} active={!!myNote}>
                  {me?.photoUrl ? (
                    <Image source={{ uri: me.photoUrl }} style={{ width: noteAvatarSize, height: noteAvatarSize, borderRadius: noteAvatarSize / 2 }} />
                  ) : (
                    <View style={[styles.noteFallback, { width: noteAvatarSize, height: noteAvatarSize, borderRadius: noteAvatarSize / 2 }]}>
                      <Initial text={(me?.displayName ?? 'M')[0]} size={noteAvatarSize} />
                    </View>
                  )}
                </GradientRing>
                <Text style={styles.noteName} numberOfLines={1}>{t('ci_your_note')}</Text>
              </PressableScale>

              {/* Notes des gens que je suis */}
              {otherNotes.map((n) => (
                <PressableScale key={n.id} style={styles.noteItem} onPress={() => n.user && router.push(`/user/${n.user.id}` as never)}>
                  <View style={styles.noteBubble}><Text style={styles.noteBubbleTxt} numberOfLines={2}>{n.text}</Text></View>
                  <GradientRing size={NOTE_RING} active>
                    {n.user?.photoUrl ? (
                      <Image source={{ uri: n.user.photoUrl }} style={{ width: noteAvatarSize, height: noteAvatarSize, borderRadius: noteAvatarSize / 2 }} />
                    ) : (
                      <View style={[styles.noteFallback, { width: noteAvatarSize, height: noteAvatarSize, borderRadius: noteAvatarSize / 2 }]}>
                        <Initial text={n.user?.displayName?.[0] ?? '?'} size={noteAvatarSize} />
                      </View>
                    )}
                  </GradientRing>
                  <Text style={styles.noteName} numberOfLines={1}>{n.user?.displayName?.split(' ')[0]}</Text>
                </PressableScale>
              ))}
            </ScrollView>
          }
          renderItem={({ item, index }) => {
            const isGroup = item.isGroup;
            const name = isGroup ? (item.title ?? t('ci_group_default')) : (item.otherUser?.displayName ?? t('ci_unknown'));
            const photo = isGroup ? item.photoUrl : item.otherUser?.photoUrl;
            const last = item.lastMessage;
            // Non lu : un message existe, il ne vient pas de moi, et il est
            // arrivé après ma dernière lecture de cette conversation (ou je ne
            // l'ai encore jamais ouverte). `lastReadAt` est déjà mis à jour
            // côté serveur à l'ouverture d'une conversation (chat.service.ts).
            const isUnread = !!last && last.senderId !== me?.id
              && (!item.lastReadAt || new Date(last.createdAt) > new Date(item.lastReadAt));
            // Appel manqué/refusé/terminé : aperçu dédié (icône + libellé),
            // traduit dans la langue de CELUI QUI REGARDE la liste — plutôt
            // que le texte brut stocké côté serveur (fixé à la langue de
            // l'appelant au moment de l'appel, comme pour les messages vocaux).
            const previewText = last?.type === 'call'
              ? last.callStatus === 'missed' ? t('ci_call_missed')
                : last.callStatus === 'declined' ? t('ci_call_declined')
                : t('ci_call_answered')
              : last?.content ?? t('ci_new_conversation');
            const avatarSize = ringInner(ROW_RING);

            const row = (
              <PressableScale style={[styles.convRow, isUnread && styles.convRowUnread]} onPress={() => router.push(`/chat/${item.id}`)} scaleTo={0.98}>
                <GradientRing size={ROW_RING} active={isUnread}>
                  <Avatar
                    uri={photo}
                    size={avatarSize}
                    placeholderColor={colors.surfaceElevated}
                    fallback={<Initial text={isGroup ? '👥' : name[0]} size={avatarSize} />}
                  />
                </GradientRing>
                <View style={styles.convBody}>
                  <View style={styles.convTop}>
                    <View style={styles.convNameRow}>
                      <Text style={[styles.convName, isUnread && styles.convNameUnread]} numberOfLines={1}>
                        {name}{isGroup && item.participantsCount ? `  ·  ${item.participantsCount}` : ''}
                      </Text>
                      {!isGroup && <PlanBadgeIcon plan={item.otherUser?.plan} size={26} />}
                    </View>
                    <Text style={[styles.convTime, isUnread && styles.convTimeUnread]}>{formatAgo(item.updatedAt, t)}</Text>
                  </View>
                  <View style={styles.convBottom}>
                    <Text style={[styles.convLast, isUnread && styles.convLastUnread]} numberOfLines={1}>
                      {previewText}
                    </Text>
                    {isUnread ? (
                      <View style={styles.unreadDot}><BrandFill /></View>
                    ) : null}
                  </View>
                </View>
              </PressableScale>
            );
            return index < CASCADE_MAX ? <Reveal index={index} from="fade">{row}</Reveal> : row;
          }}
          contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            <Reveal style={styles.empty}>
              <View style={styles.emptyMedal}>
                <BrandFill />
                <Text style={styles.emptyEmoji}>💬</Text>
              </View>
              <Text style={styles.emptyTitle}>{t('ci_empty_title')}</Text>
              <Text style={styles.emptyText}>{t('ci_empty_text')}</Text>
            </Reveal>
          }
        />
      )}

      {/* ── Modal ma note ──────────────────────────────────────────────────── */}
      <Modal visible={noteModal} transparent animationType="slide" onRequestClose={() => setNoteModal(false)}>
        <Pressable style={styles.noteOverlay} onPress={() => setNoteModal(false)}>
          <Pressable style={styles.noteSheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
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
                <PressableScale style={styles.noteDeleteBtn} onPress={() => { setNoteText(''); void saveNote(); }}>
                  <Text style={{ color: colors.danger, fontWeight: '800' }}>{t('ci_delete')}</Text>
                </PressableScale>
              ) : null}
              <PressableScale style={styles.noteSaveBtn} onPress={() => void saveNote()} haptic>
                <BrandFill />
                <Text style={{ color: '#fff', fontWeight: '800' }}>{t('ci_share')}</Text>
              </PressableScale>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <FeatureTip feature="chat" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHAT_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // En-tête
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs,
  },
  headerIcon: { fontSize: 20, color: '#fff', fontWeight: '700' },
  title: { flex: 1, color: colors.textPrimary, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  newBtn: {
    width: 42, height: 42, borderRadius: 21, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', ...elevation.glowBrand,
  },
  newBtnTxt: { color: '#fff', fontSize: 26, fontWeight: '400', marginTop: -2 },

  // Notes
  notesScroll: { marginTop: spacing.sm, marginBottom: spacing.sm },
  notesRow: { paddingHorizontal: spacing.sm, gap: 14 },
  noteItem: { alignItems: 'center', width: 80 },
  noteBubble: {
    backgroundColor: CHAT_GLASS, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 8, paddingVertical: 6, marginBottom: -8, zIndex: 2, maxWidth: 86, minHeight: 32,
    justifyContent: 'center',
  },
  noteBubbleTxt: { fontSize: 10.5, color: colors.textPrimary, textAlign: 'center', fontWeight: '600' },
  noteFallback: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  noteName: { fontSize: 11, color: colors.textSecondary, marginTop: 6, textAlign: 'center', fontWeight: '600' },

  // Conversations
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.sm, paddingVertical: 10, borderRadius: radius.lg,
  },
  // Non lu : un léger verre derrière la ligne, en plus de l'anneau.
  convRowUnread: { backgroundColor: 'rgba(255,255,255,0.035)' },
  convBody: { flex: 1, minWidth: 0 },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, gap: 8 },
  convNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  convName: { fontWeight: '700', color: colors.textPrimary, fontSize: 16, flexShrink: 1 },
  convNameUnread: { fontWeight: '900' },
  convTime: { fontSize: 12, color: colors.textMuted },
  convTimeUnread: { color: colors.brandSoft, fontWeight: '800' },
  convBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  convLast: { flex: 1, fontSize: 14, color: colors.textMuted },
  convLastUnread: { color: colors.textPrimary, fontWeight: '700' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, overflow: 'hidden' },

  // Vide
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl, gap: 8 },
  emptyMedal: {
    width: 84, height: 84, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm, ...elevation.glowBrand,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: colors.textPrimary, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },

  // Feuille « ma note »
  noteOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  noteSheet: {
    backgroundColor: colors.surfaceElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, paddingBottom: 40, gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE,
  },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginBottom: 4 },
  noteSheetTitle: { color: colors.textPrimary, fontWeight: '900', fontSize: 18 },
  noteInput: {
    backgroundColor: CHAT_BG, borderRadius: radius.lg, padding: 14, color: colors.textPrimary, fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  noteCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right' },
  noteDeleteBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(229,72,77,0.5)',
  },
  noteSaveBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: radius.pill, overflow: 'hidden',
  },
});
