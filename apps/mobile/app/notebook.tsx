import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { GlassCard, PressableScale, Reveal } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { feedApi } from '../lib/feed-api';
import {
  notebookApi, type ChecklistItem, type Note, type NoteDraft, type NoteKind,
} from '../lib/notebook-api';

/** Couleurs proposées — accents Yumia, jamais de couleur en dur ailleurs. */
const COLORS = [null, '#E8621A', '#5C4ECC', '#2BB673', '#F2B705', '#E5484D'];

type Tab = 'all' | 'favorite' | 'archived';

/**
 * Bloc-notes Yumia.
 *
 * Notes libres et checklists, rattachables à une journée, un lieu ou un
 * événement du calendrier. L'enregistrement est automatique et temporisé :
 * pas de bouton « Sauvegarder » à oublier.
 */
export default function NotebookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{
    placeId?: string; placeName?: string; date?: string; calendarEventId?: string;
  }>();

  const [notes, setNotes] = useState<Note[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Note | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const list = await notebookApi.list(accessToken, {
      archived: tab === 'archived',
      favorite: tab === 'favorite' ? true : undefined,
      q: search.trim() || undefined,
      placeId: params.placeId,
      calendarEventId: params.calendarEventId,
    });
    setNotes(list);
    setLoading(false);
  }, [accessToken, tab, search, params.placeId, params.calendarEventId]);

  // Recherche temporisée : sans ça, chaque frappe déclencherait une requête.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(), 280);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [load]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openNew = () => { setEditing(null); setEditorOpen(true); };

  const save = async (draft: NoteDraft) => {
    if (!accessToken) return;
    if (editing) {
      const res = await notebookApi.update(accessToken, editing.id, {
        ...draft,
        knownUpdatedAt: editing.updatedAt,
      });
      if (res?.staleWrite) {
        Alert.alert(
          'Note modifiée ailleurs',
          'Cette note avait été modifiée sur un autre appareil. Ta version a été conservée.',
        );
      }
    } else {
      await notebookApi.create(accessToken, {
        ...draft,
        placeId: params.placeId ?? null,
        placeName: params.placeName ?? null,
        noteDate: params.date ?? null,
        calendarEventId: params.calendarEventId ?? null,
      });
    }
    setEditorOpen(false);
    setEditing(null);
    void load();
  };

  const toggleFavorite = async (note: Note) => {
    if (!accessToken) return;
    // Optimiste : l'étoile réagit immédiatement, le réseau suit.
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, favorite: !n.favorite } : n)));
    await notebookApi.update(accessToken, note.id, { favorite: !note.favorite });
  };

  const archive = async (note: Note) => {
    if (!accessToken) return;
    await notebookApi.setArchived(accessToken, note.id, !note.archived);
    void load();
  };

  const remove = (note: Note) => {
    Alert.alert('Supprimer la note ?', note.title ?? 'Cette note', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          if (!accessToken) return;
          await notebookApi.remove(accessToken, note.id);
          setEditorOpen(false);
          setEditing(null);
          void load();
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={gradients.brandSoft} style={styles.ambient} pointerEvents="none" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>←</Text>
        </PressableScale>
        <Text style={styles.headerTitle}>Bloc-notes</Text>
        <PressableScale onPress={openNew} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>＋</Text>
        </PressableScale>
      </View>

      {params.placeName ? (
        <Text style={styles.contextHint}>📍 Notes liées à {params.placeName}</Text>
      ) : null}

      <GlassCard variant="pill" rounded={radius.pill} style={styles.searchCard} sheen={false}>
        <View style={styles.searchInner}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher une note"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <PressableScale onPress={() => setSearch('')} hitSlop={10}>
              <Text style={styles.searchClear}>✕</Text>
            </PressableScale>
          )}
        </View>
      </GlassCard>

      <View style={styles.tabs}>
        {(['all', 'favorite', 'archived'] as Tab[]).map((t) => (
          <PressableScale
            key={t}
            scaleTo={0.94}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>
              {t === 'all' ? 'Toutes' : t === 'favorite' ? '⭐ Favorites' : '🗄️ Archivées'}
            </Text>
          </PressableScale>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(n) => n.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📝</Text>
              <Text style={styles.emptyTxt}>
                {search
                  ? 'Aucune note ne correspond.'
                  : tab === 'archived'
                    ? 'Aucune note archivée.'
                    : 'Appuie sur ＋ pour créer ta première note.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Reveal index={Math.min(index, 8)} style={styles.cardWrap}>
              <NoteCard
                note={item}
                onPress={() => { setEditing(item); setEditorOpen(true); }}
                onToggleFavorite={() => void toggleFavorite(item)}
                onArchive={() => void archive(item)}
              />
            </Reveal>
          )}
        />
      )}

      <NoteEditor
        visible={editorOpen}
        initial={editing}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSave={(d) => void save(d)}
        onDelete={editing ? () => remove(editing) : undefined}
      />
    </View>
  );
}

// ── Carte de note ────────────────────────────────────────────────────────────

function NoteCard({
  note, onPress, onToggleFavorite, onArchive,
}: {
  note: Note;
  onPress: () => void;
  onToggleFavorite: () => void;
  onArchive: () => void;
}) {
  const done = note.items.filter((i) => i.done).length;

  return (
    <PressableScale onPress={onPress} onLongPress={onArchive} scaleTo={0.97}>
      <GlassCard rounded={radius.md} style={styles.card}>
        <View style={styles.cardInner}>
          {note.color && <View style={[styles.colorBar, { backgroundColor: note.color }]} />}

          <View style={styles.cardHead}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {note.title || (note.kind === 'checklist' ? 'Liste' : 'Note')}
            </Text>
            <PressableScale onPress={onToggleFavorite} hitSlop={10}>
              <Text style={styles.star}>{note.favorite ? '⭐' : '☆'}</Text>
            </PressableScale>
          </View>

          {note.kind === 'checklist' ? (
            <View style={styles.preview}>
              {note.items.slice(0, 4).map((i) => (
                <Text key={i.id} style={[styles.item, i.done && styles.itemDone]} numberOfLines={1}>
                  {i.done ? '☑' : '☐'} {i.text}
                </Text>
              ))}
              {note.items.length > 4 && (
                <Text style={styles.more}>+{note.items.length - 4} autres</Text>
              )}
            </View>
          ) : (
            <Text style={styles.preview} numberOfLines={5}>{note.content}</Text>
          )}

          {note.photoUrls.length > 0 && (
            <Image source={{ uri: note.photoUrls[0] }} style={styles.cardPhoto} />
          )}

          <View style={styles.cardFoot}>
            {note.kind === 'checklist' && note.items.length > 0 && (
              <Text style={styles.footTxt}>{done}/{note.items.length}</Text>
            )}
            {note.placeName && (
              <Text style={styles.footTxt} numberOfLines={1}>📍 {note.placeName}</Text>
            )}
            {note.pinned && <Text style={styles.footTxt}>📌</Text>}
          </View>
        </View>
      </GlassCard>
    </PressableScale>
  );
}

// ── Éditeur ──────────────────────────────────────────────────────────────────

function NoteEditor({
  visible, initial, onClose, onSave, onDelete,
}: {
  visible: boolean;
  initial: Note | null;
  onClose: () => void;
  onSave: (draft: NoteDraft) => void;
  onDelete?: () => void;
}) {
  const { accessToken } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<NoteKind>('note');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [color, setColor] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newItem, setNewItem] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(initial?.title ?? '');
    setContent(initial?.content ?? '');
    setKind(initial?.kind ?? 'note');
    setItems(initial?.items ?? []);
    setColor(initial?.color ?? null);
    setPinned(initial?.pinned ?? false);
    setPhotoUrls(initial?.photoUrls ?? []);
    setNewItem('');
  }, [visible, initial]);

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    setItems((prev) => [...prev, { id: `${Date.now()}`, text, done: false }]);
    setNewItem('');
  };

  const toggleItem = (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const addPhoto = async () => {
    if (!accessToken) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;

    setUploading(true);
    try {
      // Réutilise l'upload média existant : pas de nouvel endpoint à maintenir.
      const url = await feedApi.uploadMedia(accessToken, res.assets[0].uri);
      setPhotoUrls((prev) => [...prev, url]);
    } catch {
      Alert.alert('Erreur', 'L\'image n\'a pas pu être envoyée.');
    }
    setUploading(false);
  };

  const submit = () => {
    onSave({ title: title.trim() || null, content, kind, items, color, pinned, photoUrls });
  };

  const empty = !title.trim() && !content.trim() && items.length === 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <PressableScale onPress={onClose} hitSlop={10}>
              <Text style={styles.cancel}>Fermer</Text>
            </PressableScale>
            <View style={styles.kindToggle}>
              {(['note', 'checklist'] as NoteKind[]).map((k) => (
                <PressableScale key={k} scaleTo={0.94} onPress={() => setKind(k)}>
                  <View style={[styles.kindBtn, kind === k && styles.kindBtnActive]}>
                    <Text style={[styles.kindTxt, kind === k && styles.kindTxtActive]}>
                      {k === 'note' ? '📝 Note' : '☑ Liste'}
                    </Text>
                  </View>
                </PressableScale>
              ))}
            </View>
            <PressableScale onPress={submit} hitSlop={10} disabled={empty}>
              <Text style={[styles.save, empty && styles.saveDisabled]}>OK</Text>
            </PressableScale>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.titleInput}
              placeholder="Titre"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            {kind === 'note' ? (
              <TextInput
                style={styles.contentInput}
                placeholder="Écris ici…"
                placeholderTextColor={colors.textMuted}
                value={content}
                onChangeText={setContent}
                multiline
                autoFocus={!initial}
              />
            ) : (
              <View style={styles.checklist}>
                {items.map((i) => (
                  <View key={i.id} style={styles.itemRow}>
                    <PressableScale onPress={() => toggleItem(i.id)} hitSlop={8}>
                      <Text style={styles.checkbox}>{i.done ? '☑' : '☐'}</Text>
                    </PressableScale>
                    <Text style={[styles.itemTxt, i.done && styles.itemDone]}>{i.text}</Text>
                    <PressableScale onPress={() => removeItem(i.id)} hitSlop={8}>
                      <Text style={styles.itemRemove}>✕</Text>
                    </PressableScale>
                  </View>
                ))}
                <View style={styles.itemRow}>
                  <Text style={styles.checkbox}>＋</Text>
                  <TextInput
                    style={styles.itemInput}
                    placeholder="Ajouter un élément"
                    placeholderTextColor={colors.textMuted}
                    value={newItem}
                    onChangeText={setNewItem}
                    onSubmitEditing={addItem}
                    returnKeyType="done"
                    blurOnSubmit={false}
                  />
                </View>
              </View>
            )}

            {photoUrls.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photos}>
                {photoUrls.map((url) => (
                  <PressableScale
                    key={url}
                    onPress={() => setPhotoUrls((p) => p.filter((u) => u !== url))}
                  >
                    <Image source={{ uri: url }} style={styles.photo} />
                  </PressableScale>
                ))}
              </ScrollView>
            )}

            <View style={styles.toolbar}>
              <PressableScale onPress={() => void addPhoto()} style={styles.tool} disabled={uploading}>
                <Text style={styles.toolTxt}>{uploading ? '⏳' : '🖼️'} Photo</Text>
              </PressableScale>
              <PressableScale onPress={() => setPinned((p) => !p)} style={[styles.tool, pinned && styles.toolActive]}>
                <Text style={styles.toolTxt}>📌 Épingler</Text>
              </PressableScale>
            </View>

            <View style={styles.colors}>
              {COLORS.map((c) => (
                <PressableScale key={c ?? 'none'} scaleTo={0.9} onPress={() => setColor(c)}>
                  <View style={[
                    styles.colorDot,
                    c ? { backgroundColor: c } : styles.colorNone,
                    color === c && styles.colorActive,
                  ]} />
                </PressableScale>
              ))}
            </View>

            {onDelete && (
              <PressableScale onPress={onDelete} style={styles.deleteBtn}>
                <Text style={styles.deleteTxt}>Supprimer la note</Text>
              </PressableScale>
            )}

            <View style={{ height: spacing.xxl }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  ambient: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  headerBtn: { width: 40 },
  headerIcon: { fontSize: 24, color: colors.textPrimary, fontWeight: '700' },
  headerTitle: { ...typography.title, color: colors.textPrimary },
  contextHint: {
    ...typography.caption, color: colors.brandSoft,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },

  searchCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  searchInner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
  searchClear: { ...typography.body, color: colors.textMuted },

  tabs: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  tab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabTxt: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  tabTxtActive: { color: '#fff', fontWeight: '700' },

  list: { paddingHorizontal: spacing.sm },
  column: { gap: spacing.sm },
  cardWrap: { flex: 1, marginBottom: spacing.sm },
  card: { minHeight: 130 },
  cardInner: { padding: spacing.md, gap: spacing.sm },
  colorBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    borderTopLeftRadius: radius.md, borderBottomLeftRadius: radius.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700', flex: 1 },
  star: { fontSize: 15 },
  preview: { ...typography.caption, color: colors.textSecondary, lineHeight: 19, gap: 2 },
  item: { ...typography.caption, color: colors.textSecondary },
  itemDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  more: { ...typography.label, color: colors.textMuted },
  cardPhoto: { width: '100%', height: 72, borderRadius: radius.sm },
  cardFoot: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  footTxt: { ...typography.label, color: colors.textMuted, flexShrink: 1 },

  empty: { alignItems: 'center', paddingTop: 90, gap: spacing.sm },
  emptyEmoji: { fontSize: 52 },
  emptyTxt: {
    ...typography.body, color: colors.textSecondary,
    textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 21,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, maxHeight: '92%',
  },
  handle: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  cancel: { ...typography.body, color: colors.textMuted },
  save: { ...typography.body, color: colors.brand, fontWeight: '700' },
  saveDisabled: { opacity: 0.4 },
  kindToggle: { flexDirection: 'row', gap: 4 },
  kindBtn: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  kindBtnActive: { backgroundColor: colors.surfaceElevated },
  kindTxt: { ...typography.label, color: colors.textMuted, fontWeight: '600' },
  kindTxtActive: { color: colors.textPrimary, fontWeight: '700' },

  titleInput: {
    ...typography.title, color: colors.textPrimary, paddingVertical: spacing.sm,
  },
  contentInput: {
    ...typography.body, color: colors.textPrimary,
    minHeight: 180, textAlignVertical: 'top', lineHeight: 22,
  },

  checklist: { gap: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  checkbox: { fontSize: 19, color: colors.brand, width: 24 },
  itemTxt: { ...typography.body, color: colors.textPrimary, flex: 1 },
  itemRemove: { ...typography.caption, color: colors.textMuted, paddingHorizontal: 6 },
  itemInput: { ...typography.body, color: colors.textPrimary, flex: 1, padding: 0 },

  photos: { marginTop: spacing.md },
  photo: { width: 92, height: 92, borderRadius: radius.md, marginRight: spacing.sm },

  toolbar: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  tool: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  toolActive: { backgroundColor: `${colors.brand}33` },
  toolTxt: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },

  colors: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorNone: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  colorActive: { borderWidth: 2, borderColor: colors.textPrimary },

  deleteBtn: { marginTop: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  deleteTxt: { ...typography.body, color: colors.danger, fontWeight: '600' },
});
