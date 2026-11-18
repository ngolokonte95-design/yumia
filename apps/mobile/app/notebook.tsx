import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, I18nManager, Image, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { PressableScale, Reveal } from '../components/ui';
import {
  BrandFab, BrandPill, BrandProgress, CheckDot, CrystalChip, CrystalTitle, GLASS, GlassSheet,
  PlannerEmpty, SheetHeader,
} from '../components/calendar/PlannerChrome';
import { GlassCircleButton } from '../components/profile/ProfileChrome';
import { PillTabs } from '../components/p2b/ProfileVisuals';
import { SpaceBackdrop, SPACE_BLACK } from '../components/auth/AuthChrome';
import { formatLongDate } from '../lib/calendar-format';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { feedApi } from '../lib/feed-api';
import {
  notebookApi, type ChecklistItem, type Note, type NoteDraft, type NoteKind,
} from '../lib/notebook-api';
import { useI18n } from '../lib/useI18n';

/** Couleurs proposées — accents Yumia, jamais de couleur en dur ailleurs. */
const COLORS = [null, '#E8621A', '#5C4ECC', '#2BB673', '#F2B705', '#E5484D'];

type Tab = 'all' | 'favorite' | 'archived';

/**
 * Bloc-notes Yumia — DA du 18/11/2026.
 *
 * Fond spatial de l'Accueil, titre en blanc cristal, notes en mosaïque de
 * verre sur deux colonnes (hauteurs libres). La couleur choisie pour une note
 * ne teinte plus qu'un halo radial discret dans son coin ; les listes ont des
 * cases rondes et une fine barre de progression au dégradé de marque.
 *
 * Notes libres et checklists, rattachables à une journée, un lieu ou un
 * événement du calendrier.
 */
export default function NotebookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const { t, locale } = useI18n();
  const params = useLocalSearchParams<{
    placeId?: string; placeName?: string; date?: string; calendarEventId?: string;
  }>();

  const [notes, setNotes] = useState<Note[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Note | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [newKind, setNewKind] = useState<NoteKind>('note');
  const [refreshing, setRefreshing] = useState(false);

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

  const openNew = (kind: NoteKind = 'note') => { setNewKind(kind); setEditing(null); setEditorOpen(true); };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  // Mosaïque : chaque note va dans la colonne la moins haute (hauteur
  // estimée d'après son contenu), comme un mur de post-it.
  const columns = useMemo(() => {
    const left: { note: Note; index: number }[] = [];
    const right: { note: Note; index: number }[] = [];
    let hl = 0;
    let hr = 0;
    notes.forEach((note, index) => {
      const h = estimateHeight(note);
      if (hl <= hr) { left.push({ note, index }); hl += h; }
      else { right.push({ note, index }); hr += h; }
    });
    return [left, right];
  }, [notes]);

  const subtitle = params.placeName
    ? t('nb_context_hint').replace('{place}', params.placeName)
    : params.date
      ? capitalize(formatLongDate(parseDayKey(params.date), locale))
      : undefined;

  const save = async (draft: NoteDraft) => {
    if (!accessToken) return;
    if (editing) {
      const res = await notebookApi.update(accessToken, editing.id, {
        ...draft,
        knownUpdatedAt: editing.updatedAt,
      });
      if (res?.staleWrite) {
        Alert.alert(
          t('nb_stale_write_title'),
          t('nb_stale_write_body'),
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
    Alert.alert(t('nb_delete_confirm_title'), note.title ?? t('nb_this_note'), [
      { text: t('nb_cancel'), style: 'cancel' },
      {
        text: t('nb_delete'),
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
      <SpaceBackdrop />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor="#fff"
            colors={[colors.brand]}
            progressBackgroundColor={colors.surface}
          />
        )}
      >
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <GlassCircleButton label={I18nManager.isRTL ? '→' : '←'} onPress={() => router.back()} />
        </View>

        <Reveal style={styles.hero}>
          <CrystalTitle title={t('nb_title')} subtitle={subtitle} style={styles.heroTitle} />
        </Reveal>

        <Reveal index={1} style={[styles.search, GLASS]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t('nb_search_placeholder')}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <PressableScale onPress={() => setSearch('')} hitSlop={10}>
              <Text style={styles.searchClear}>✕</Text>
            </PressableScale>
          )}
        </Reveal>

        <Reveal index={2}>
          <PillTabs<Tab>
            style={styles.tabs}
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'all', label: t('nb_tab_all') },
              { key: 'favorite', label: t('nb_tab_favorite') },
              { key: 'archived', label: t('nb_tab_archived') },
            ]}
          />
        </Reveal>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color="#fff" size="large" /></View>
        ) : notes.length === 0 ? (
          <PlannerEmpty
            emoji="📝"
            text={search
              ? t('nb_empty_search')
              : tab === 'archived'
                ? t('nb_empty_archived')
                : t('nb_empty_default')}
          >
            {!search && tab !== 'archived' ? (
              <>
                <BrandPill label={`＋ ${t('nb_kind_note')}`} onPress={() => openNew('note')} />
                <CrystalChip label={`＋ ${t('nb_kind_checklist')}`} active={false} onPress={() => openNew('checklist')} />
              </>
            ) : null}
          </PlannerEmpty>
        ) : (
          <View style={styles.wall}>
            {columns.map((col, c) => (
              <View key={c} style={styles.wallCol}>
                {col.map(({ note, index }) => (
                  <Reveal key={note.id} index={Math.min(index, 8)}>
                    <NoteCard
                      note={note}
                      locale={locale}
                      onPress={() => { setEditing(note); setEditorOpen(true); }}
                      onToggleFavorite={() => void toggleFavorite(note)}
                      onArchive={() => void archive(note)}
                    />
                  </Reveal>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <BrandFab onPress={() => openNew('note')} bottom={insets.bottom + 20} accessibilityLabel={t('nb_kind_note')} />

      <NoteEditor
        visible={editorOpen}
        initial={editing}
        initialKind={newKind}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSave={(d) => void save(d)}
        onDelete={editing ? () => remove(editing) : undefined}
      />
    </View>
  );
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** `AAAA-MM-JJ` → date locale (minuit). */
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
}

/** Hauteur approximative d'une carte, pour équilibrer les deux colonnes. */
function estimateHeight(note: Note): number {
  let h = 78;
  if (note.kind === 'checklist') {
    h += Math.min(note.items.length, 4) * 22 + (note.items.length > 4 ? 18 : 0) + (note.items.length ? 14 : 0);
  } else {
    h += Math.min(6, Math.ceil((note.content?.length ?? 0) / 20)) * 19;
  }
  if (note.photoUrls.length > 0) h += 104;
  return h;
}

/** Date courte de dernière modification (« 18 nov. »). */
function shortDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

// ── Carte de note ────────────────────────────────────────────────────────────

function NoteCard({
  note, locale, onPress, onToggleFavorite, onArchive,
}: {
  note: Note;
  locale: string;
  onPress: () => void;
  onToggleFavorite: () => void;
  onArchive: () => void;
}) {
  const { t } = useI18n();
  const done = note.items.filter((i) => i.done).length;
  const total = note.items.length;

  return (
    <PressableScale onPress={onPress} onLongPress={onArchive} scaleTo={0.97} style={styles.cardWrap}>
      <View style={[styles.card, GLASS, note.pinned && styles.cardPinned]}>
        {/* La couleur de la note : un halo radial qui s'éteint dans le coin. */}
        {note.color ? (
          <View pointerEvents="none" style={styles.cardGlow}>
            <Svg width={180} height={180}>
              <Defs>
                <RadialGradient id={`nbGlow${note.id}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={note.color} stopOpacity="0.32" />
                  <Stop offset="1" stopColor={note.color} stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx={90} cy={90} r={90} fill={`url(#nbGlow${note.id})`} />
            </Svg>
          </View>
        ) : null}

        <View style={styles.cardHead}>
          {note.color ? <View style={[styles.colorDot, { backgroundColor: note.color }]} /> : null}
          <Text style={styles.cardTitle} numberOfLines={2}>
            {note.title || (note.kind === 'checklist' ? t('nb_card_list_default') : t('nb_card_note_default'))}
          </Text>
          <PressableScale onPress={onToggleFavorite} hitSlop={10} scaleTo={0.8}>
            <Text style={[styles.star, note.favorite && styles.starOn]}>{note.favorite ? '★' : '☆'}</Text>
          </PressableScale>
        </View>

        {note.kind === 'checklist' ? (
          <View style={styles.checkPreview}>
            {note.items.slice(0, 4).map((i) => (
              <View key={i.id} style={styles.checkRow}>
                <CheckDot done={i.done} size={15} />
                <Text style={[styles.item, i.done && styles.itemDone]} numberOfLines={1}>{i.text}</Text>
              </View>
            ))}
            {total > 4 && (
              <Text style={styles.more}>{t('nb_others_count').replace('{n}', String(total - 4))}</Text>
            )}
            {total > 0 ? <BrandProgress value={done / total} style={styles.progress} /> : null}
          </View>
        ) : note.content ? (
          <Text style={styles.preview} numberOfLines={6}>{note.content}</Text>
        ) : null}

        {note.photoUrls.length > 0 && (
          <Image source={{ uri: note.photoUrls[0] }} style={styles.cardPhoto} />
        )}

        <View style={styles.cardFoot}>
          <Text style={styles.footTxt}>{shortDate(note.updatedAt, locale)}</Text>
          {note.kind === 'checklist' && total > 0 && (
            <Text style={styles.footTxt}>· {done}/{total}</Text>
          )}
          {note.placeName && (
            <Text style={[styles.footTxt, styles.footPlace]} numberOfLines={1}>· 📍 {note.placeName}</Text>
          )}
          {note.pinned && <Text style={styles.footPin}>📌</Text>}
        </View>
      </View>
    </PressableScale>
  );
}

// ── Éditeur ──────────────────────────────────────────────────────────────────

function NoteEditor({
  visible, initial, initialKind = 'note', onClose, onSave, onDelete,
}: {
  visible: boolean;
  initial: Note | null;
  /** Type d'une nouvelle note (note libre ou liste). */
  initialKind?: NoteKind;
  onClose: () => void;
  onSave: (draft: NoteDraft) => void;
  onDelete?: () => void;
}) {
  const { accessToken } = useAuth();
  const { t } = useI18n();
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
    setKind(initial?.kind ?? initialKind);
    setItems(initial?.items ?? []);
    setColor(initial?.color ?? null);
    setPinned(initial?.pinned ?? false);
    setPhotoUrls(initial?.photoUrls ?? []);
    setNewItem('');
  }, [visible, initial, initialKind]);

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
      Alert.alert(t('nb_error'), t('nb_photo_upload_error'));
    }
    setUploading(false);
  };

  const submit = () => {
    onSave({ title: title.trim() || null, content, kind, items, color, pinned, photoUrls });
  };

  const empty = !title.trim() && !content.trim() && items.length === 0;

  const doneCount = items.filter((i) => i.done).length;

  return (
    <GlassSheet visible={visible} onClose={onClose}>
      <SheetHeader
        leftLabel={t('nb_close')}
        onLeft={onClose}
        center={(
          <View style={styles.kindToggle}>
            {(['note', 'checklist'] as NoteKind[]).map((k) => (
              <CrystalChip
                key={k}
                label={k === 'note' ? t('nb_kind_note') : t('nb_kind_checklist')}
                active={kind === k}
                onPress={() => setKind(k)}
                style={styles.kindChip}
              />
            ))}
          </View>
        )}
        onOk={submit}
        okDisabled={empty}
      />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.titleInput}
          placeholder={t('nb_title_placeholder')}
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />

        {kind === 'note' ? (
          <TextInput
            style={styles.contentInput}
            placeholder={t('nb_write_here_placeholder')}
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus={!initial}
          />
        ) : (
          <View style={styles.checklist}>
            {items.length > 0 ? (
              <View style={styles.checkHead}>
                <BrandProgress value={doneCount / items.length} style={styles.flex1} />
                <Text style={styles.checkCount}>{doneCount}/{items.length}</Text>
              </View>
            ) : null}
            {items.map((i) => (
              <View key={i.id} style={styles.itemRow}>
                <PressableScale onPress={() => toggleItem(i.id)} hitSlop={8} scaleTo={0.85}>
                  <CheckDot done={i.done} size={24} />
                </PressableScale>
                <Text style={[styles.itemTxt, i.done && styles.itemDone]}>{i.text}</Text>
                <PressableScale onPress={() => removeItem(i.id)} hitSlop={8}>
                  <Text style={styles.itemRemove}>✕</Text>
                </PressableScale>
              </View>
            ))}
            <View style={styles.itemRow}>
              <View style={styles.addRing}><Text style={styles.addPlus}>＋</Text></View>
              <TextInput
                style={styles.itemInput}
                placeholder={t('nb_add_item_placeholder')}
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
                style={styles.photoWrap}
              >
                <Image source={{ uri: url }} style={styles.photo} />
                <View style={styles.photoRemove}><Text style={styles.photoRemoveTxt}>✕</Text></View>
              </PressableScale>
            ))}
          </ScrollView>
        )}

        <View style={styles.toolbar}>
          <CrystalChip
            label={`${uploading ? '⏳' : '🖼️'} ${t('nb_photo')}`}
            active={false}
            onPress={() => { if (!uploading) void addPhoto(); }}
          />
          <CrystalChip label={t('nb_pin')} active={pinned} onPress={() => setPinned((p) => !p)} />
        </View>

        <View style={styles.colors}>
          {COLORS.map((c) => (
            <PressableScale key={c ?? 'none'} scaleTo={0.88} onPress={() => setColor(c)}>
              <View style={[styles.colorRing, color === c && styles.colorRingOn]}>
                <View style={[styles.colorSwatch, c ? { backgroundColor: c } : styles.colorNone]} />
              </View>
            </PressableScale>
          ))}
        </View>

        {onDelete && (
          <PressableScale onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteTxt}>{t('nb_delete_note')}</Text>
          </PressableScale>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </GlassSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SPACE_BLACK },
  flex1: { flex: 1 },
  loading: { paddingTop: 80, alignItems: 'center' },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  hero: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  heroTitle: { fontSize: 38 },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, height: 46,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
  searchClear: { ...typography.body, color: colors.textMuted },

  tabs: { marginHorizontal: spacing.md, marginBottom: spacing.md },

  // ── Mosaïque ──
  wall: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  wallCol: { flex: 1, gap: spacing.sm },
  cardWrap: {},
  card: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, overflow: 'hidden' },
  cardPinned: { borderColor: 'rgba(255,255,255,0.30)' },
  cardGlow: { position: 'absolute', top: -70, left: -70 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  colorDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  cardTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '800', flex: 1 },
  star: { fontSize: 17, color: colors.textMuted, marginTop: -1 },
  starOn: { color: '#F4F7FB' },
  preview: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },
  checkPreview: { gap: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  item: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  itemDone: { textDecorationLine: 'line-through', color: colors.textMuted },
  more: { ...typography.label, color: colors.textMuted },
  progress: { marginTop: 4 },
  cardPhoto: { width: '100%', height: 96, borderRadius: radius.md },
  cardFoot: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  footTxt: { ...typography.label, color: colors.textMuted },
  footPlace: { flexShrink: 1 },
  footPin: { fontSize: 11, marginStart: 'auto' },

  // ── Éditeur ──
  kindToggle: { flexDirection: 'row', gap: 6 },
  kindChip: { height: 32, paddingHorizontal: 10 },
  titleInput: {
    fontSize: 26, fontWeight: '800', letterSpacing: -0.4, color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  contentInput: {
    ...typography.body, color: colors.textPrimary,
    minHeight: 200, textAlignVertical: 'top', lineHeight: 23,
  },

  checklist: { gap: 2, marginTop: spacing.xs },
  checkHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  checkCount: { ...typography.caption, color: colors.textSecondary, fontWeight: '800', fontVariant: ['tabular-nums'] },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8 },
  itemTxt: { ...typography.body, color: colors.textPrimary, flex: 1 },
  itemRemove: { ...typography.caption, color: colors.textMuted, paddingHorizontal: 6 },
  addRing: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  addPlus: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  itemInput: { ...typography.body, color: colors.textPrimary, flex: 1, padding: 0 },

  photos: { marginTop: spacing.md },
  photoWrap: { marginEnd: spacing.sm },
  photo: { width: 96, height: 96, borderRadius: radius.md },
  photoRemove: {
    position: 'absolute', top: 6, end: 6, width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)',
  },
  photoRemoveTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },

  toolbar: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },

  colors: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  colorRing: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  colorRingOn: { borderColor: '#F4F7FB' },
  colorSwatch: { width: 28, height: 28, borderRadius: 14 },
  colorNone: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },

  deleteBtn: { marginTop: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  deleteTxt: { ...typography.body, color: colors.danger, fontWeight: '700' },
});
