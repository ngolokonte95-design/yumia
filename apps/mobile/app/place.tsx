/**
 * PLACE DETAIL — fiche complète d'un lieu avec mini-chat IA.
 * Les données arrivent via placeStore (module singleton) pour éviter
 * la sérialisation d'objets complexes dans les URL params.
 */
import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import type { VisitFeedback } from '../lib/passport-api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UNIVERSE_META } from '@yumia/shared';
import { safeMeta, placeEmoji } from '../lib/universeMeta';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import { useSaved } from '../lib/useSaved';
import { placeStore } from '../lib/place-store';
import { recordVisit } from '../lib/passport-api';
import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { haptics } from '../lib/useHaptics';
import { askAboutPlace } from '../lib/chat-api';
import { XpToast } from '../components/XpToast';
import { PhotoViewer } from '../components/PhotoViewer';
import { usePlaceStats } from '../lib/usePlaceStats';
import { fetchPlaceById, fetchNearby, uploadPlacePhoto } from '../lib/places-api';
import type { NearbyPlace } from '../lib/places-api';
import type { VisitResult } from '../lib/passport-api';
import type { Suggestion, Universe } from '@yumia/shared';
import * as StoreReview from 'expo-store-review';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export default function PlaceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { t } = useI18n();
  const { savedIds, save, unsave } = useSaved(accessToken);
  const { id: deepLinkId } = useLocalSearchParams<{ id?: string }>();

  const [deepLinkSuggestion, setDeepLinkSuggestion] = useState<Suggestion | null>(null);
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);

  const suggestion = placeStore.get() ?? deepLinkSuggestion;
  const scrollRef = useRef<ScrollView>(null);
  const { stats } = usePlaceStats(suggestion?.place.id ?? '');

  const [visitState, setVisitState] = useState<'idle' | 'submitting' | 'feedback' | 'done'>('idle');
  const [xpResult, setXpResult] = useState<VisitResult | null>(null);
  const [visitNotes, setVisitNotes] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState<VisitFeedback | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Deep link : charge le lieu depuis l'API quand ouvert via yumia://place?id=
  useEffect(() => {
    if (!deepLinkId || placeStore.get()) return;
    setDeepLinkLoading(true);
    fetchPlaceById(deepLinkId)
      .then((p) => {
        const s: Suggestion = {
          place: {
            id: p.id,
            name: p.name,
            universe: p.universe,
            location: { lat: p.lat, lng: p.lng },
            city: p.city,
            countryCode: p.countryCode,
            rating: p.rating,
            priceTier: p.priceTier as 1 | 2 | 3 | 4,
            photoUrls: p.photoUrls ?? [],
            tags: p.tags ?? [],
          },
          compatibility: 0,
          distanceMeters: 0,
          reason: '📍 Ouvert via un lien',
          engine: 'mood',
        };
        setDeepLinkSuggestion(s);
      })
      .catch(() => {/* affiche "lieu introuvable" en dessous */})
      .finally(() => setDeepLinkLoading(false));
  }, [deepLinkId]);

  useEffect(() => {
    return () => { placeStore.clear(); };
  }, []);

  if (deepLinkLoading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  if (!suggestion) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>
        <Text style={styles.error}>Lieu introuvable.</Text>
      </View>
    );
  }

  const { place, compatibility, distanceMeters, reason } = suggestion;
  const meta = safeMeta(place.universe);
  const isSaved = savedIds.has(place.id);

  function handleVisit() {
    if (!accessToken || visitState !== 'idle') return;
    setVisitState('feedback');
  }

  async function handleConfirmVisit() {
    if (!accessToken || visitState !== 'feedback') return;
    setVisitState('submitting');
    try {
      const result = await recordVisit(
        accessToken,
        place.id,
        selectedFeedback ?? undefined,
        visitNotes.trim() || undefined,
      );
      setXpResult(result);
      haptics.success();
      setVisitState('done');
      // Demander un avis App Store lors des passages de niveau clés.
      const reviewLevels = new Set([2, 5, 10, 20]);
      if (reviewLevels.has(result.level) && await StoreReview.hasAction()) {
        await StoreReview.requestReview();
      }
    } catch {
      setVisitState('feedback');
    }
  }

  async function handleSave() {
    if (!accessToken) return;
    haptics.light();
    if (isSaved) { await unsave(place.id); }
    else { await save(place.id); }
  }

  async function handleShare() {
    await Share.share({
      message: `${meta.emoji} ${place.name} — découvert via YUMIA !\nyumia://place?id=${place.id}`,
      title: place.name,
      url: `yumia://place?id=${place.id}`,
    });
  }

  function handleOpenMaps() {
    const { lat, lng } = place.location;
    const label = encodeURIComponent(place.name);
    const url = Platform.OS === 'ios'
      ? `maps:?q=${label}&ll=${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    void Linking.openURL(url);
  }

  async function handleAddPhoto() {
    if (!accessToken) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      await uploadPlacePhoto(accessToken, place.id, result.assets[0].uri);
      setUploadSuccess(true);
    } catch {/* silencieux — l'image locale reste visible */} finally {
      setUploading(false);
    }
  }

  async function handleSendChat() {
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) return;
    setChatInput('');
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setChatLoading(true);
    try {
      const { reply } = await askAboutPlace(accessToken, {
        message: trimmed,
        placeName: place.name,
        placeUniverse: meta.labelFr,
        lat: place.location.lat,
        lng: place.location.lng,
        locale: user?.locale ?? 'fr',
      });
      setMessages((prev) => [...prev, { role: 'ai', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Désolé, je ne peux pas répondre pour l\'instant.' },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  const compatColor = compatibility >= 85 ? colors.compatHigh : colors.compatMid;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.bottom}
    >
      <XpToast result={xpResult} onDone={() => setXpResult(null)} />
      {place.photoUrls && place.photoUrls.length > 0 && photoViewerIndex !== null ? (
        <PhotoViewer
          photos={place.photoUrls}
          initialIndex={photoViewerIndex}
          visible={true}
          onClose={() => setPhotoViewerIndex(null)}
        />
      ) : null}
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Pressable style={styles.hero} onPress={place.photoUrls?.length ? () => setPhotoViewerIndex(0) : undefined}>
          {place.photoUrls && place.photoUrls.length > 0 ? (
            <Image
              source={{ uri: place.photoUrls[0] }}
              style={[StyleSheet.absoluteFill, styles.heroImage]}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={place.photoUrls[0]}
              transition={150}
            />
          ) : null}
          {/* Dark scrim so back button and badge stay readable over photos */}
          <View style={[StyleSheet.absoluteFill, styles.heroScrim]} />
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + spacing.lg }]}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          {(!place.photoUrls || place.photoUrls.length === 0) ? (
            <Text style={styles.heroEmoji}>{placeEmoji(place.universe, place.tags)}</Text>
          ) : null}
          {compatibility > 0 ? (
            <View style={[styles.compatBadge, { borderColor: compatColor }]}>
              <Text style={[styles.compatText, { color: compatColor }]}>❤️ {compatibility}%</Text>
            </View>
          ) : null}
        </Pressable>

        {/* Photo strip (thumbnails 2..n) */}
        {place.photoUrls && place.photoUrls.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
          >
            {place.photoUrls.slice(1).map((url, i) => (
              <Pressable key={i} onPress={() => setPhotoViewerIndex(i + 1)}>
                <Image source={{ uri: url }} style={styles.photoThumb} contentFit="cover" cachePolicy="memory-disk" recyclingKey={url} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {/* Infos */}
        <View style={styles.body}>
          <Text style={styles.name}>{place.name}</Text>
          <Text style={styles.meta}>
            {meta.labelFr}
            {' · '}{'€'.repeat(place.priceTier)}
            {distanceMeters != null ? ` · ${formatDistance(distanceMeters)}` : ''}
            {place.openNow !== undefined ? (
              <>
                {' · '}
                <Text style={{ color: place.openNow ? colors.success : colors.danger }}>
                  {place.openNow ? t('place_open') : t('place_closed')}
                </Text>
              </>
            ) : null}
          </Text>
          <View style={styles.ratingRow}>
            <Text style={styles.rating}>⭐ {place.rating.toFixed(1)}</Text>
            {place.city ? <Text style={styles.city}>{place.city}</Text> : null}
          </View>
          {place.tags && place.tags.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsRow}>
              {place.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {stats && stats.total > 0 ? (
            <CommunityReviews stats={stats} />
          ) : null}

          <Text style={styles.reason}>🤖 {reason}</Text>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionBtn, isSaved && styles.actionBtnActive]}
              onPress={handleSave}
            >
              <Text style={styles.actionText}>{isSaved ? '❤️ Sauvegardé' : '🤍 Sauvegarder'}</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={handleShare}>
              <Text style={styles.actionText}>{t('place_share_btn')}</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={handleOpenMaps}>
              <Text style={styles.actionText}>🗺️ Maps</Text>
            </Pressable>
          </View>

          {/* Réserver autour de ce lieu (guides / sorties) */}
          <View style={bizStyles.row}>
            <Pressable
              style={bizStyles.btn}
              onPress={() => router.push(`/guides${place.city ? `?city=${encodeURIComponent(place.city)}` : ''}` as never)}
            >
              <Text style={bizStyles.emoji}>🧭</Text>
              <Text style={bizStyles.label}>Un guide ici</Text>
            </Pressable>
            <Pressable style={bizStyles.btn} onPress={() => router.push('/sorties' as never)}>
              <Text style={bizStyles.emoji}>🎟️</Text>
              <Text style={bizStyles.label}>Sorties & billets</Text>
            </Pressable>
          </View>

          {accessToken ? (
            visitState === 'feedback' || visitState === 'submitting' ? (
              <View style={styles.feedbackBox}>
                <Text style={styles.feedbackPrompt}>C'était comment ?</Text>
                <View style={styles.feedbackRow}>
                  {([
                    { key: 'loved' as VisitFeedback, emoji: '❤️', label: 'Adoré' },
                    { key: 'neutral' as VisitFeedback, emoji: '😐', label: 'Correct' },
                    { key: 'disliked' as VisitFeedback, emoji: '👎', label: 'Déçu' },
                  ]).map((opt) => (
                    <Pressable
                      key={opt.key}
                      style={[styles.feedbackBtn, selectedFeedback === opt.key && styles.feedbackBtnActive]}
                      onPress={() => setSelectedFeedback(selectedFeedback === opt.key ? null : opt.key)}
                    >
                      <Text style={styles.feedbackEmoji}>{opt.emoji}</Text>
                      <Text style={styles.feedbackLabel}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Une note personnelle… (facultatif)"
                  placeholderTextColor={colors.textMuted}
                  value={visitNotes}
                  onChangeText={setVisitNotes}
                  maxLength={500}
                  multiline
                  numberOfLines={2}
                />
                <Pressable
                  style={[styles.confirmVisitBtn, visitState === 'submitting' && styles.buttonDisabled]}
                  onPress={handleConfirmVisit}
                  disabled={visitState === 'submitting'}
                >
                  {visitState === 'submitting'
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.confirmVisitText}>✓ Enregistrer ma visite</Text>
                  }
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.visitBtn, visitState === 'done' && styles.visitBtnDone]}
                onPress={handleVisit}
                disabled={visitState !== 'idle'}
              >
                <Text style={[styles.visitText, visitState === 'done' && styles.visitTextDone]}>
                  {visitState === 'done' ? t('place_visited') : t('place_visit_btn')}
                </Text>
              </Pressable>
            )
          ) : null}

          {accessToken && visitState === 'done' ? (
            <Pressable
              style={[styles.photoUploadBtn, uploading && styles.buttonDisabled]}
              onPress={handleAddPhoto}
              disabled={uploading || uploadSuccess}
            >
              {uploading ? (
                <ActivityIndicator color={colors.brand} size="small" />
              ) : (
                <Text style={styles.photoUploadText}>
                  {uploadSuccess ? '✅ Photo ajoutée !' : '📷 Ajouter une photo'}
                </Text>
              )}
            </Pressable>
          ) : null}

          <SimilarPlaces
            currentId={place.id}
            lat={place.location.lat}
            lng={place.location.lng}
            universe={place.universe}
            onOpen={(np) => {
              placeStore.set({
                place: {
                  id: np.id, name: np.name, universe: np.universe,
                  location: { lat: np.lat, lng: np.lng }, city: np.city, countryCode: np.countryCode,
                  rating: np.rating, priceTier: Math.min(4, Math.max(1, np.priceTier)) as 1 | 2 | 3 | 4,
                  photoUrls: np.photoUrls, tags: np.tags,
                },
                compatibility: 0,
                distanceMeters: np.distanceMeters,
                reason: `${safeMeta(np.universe).emoji} ${safeMeta(np.universe).labelFr} · ⭐ ${np.rating.toFixed(1)}`,
                engine: 'mood',
              });
              router.push('/place');
            }}
          />
        </View>

        {/* Mini-chat IA */}
        <View style={styles.chatSection}>
          <Text style={styles.chatTitle}>{t('place_chat_title')}</Text>

          {messages.length > 0 ? (
            <View style={styles.messages}>
              {messages.map((msg, i) => (
                <View
                  key={i}
                  style={[
                    styles.bubble,
                    msg.role === 'user' ? styles.bubbleUser : styles.bubbleAi,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAi,
                    ]}
                  >
                    {msg.text}
                  </Text>
                </View>
              ))}
              {chatLoading ? (
                <View style={styles.bubbleAi}>
                  <ActivityIndicator color={colors.brand} size="small" />
                  <Text style={styles.thinkingText}>{t('place_chat_thinking')}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            /* Suggestions rapides quand le chat est vide */
            <View style={styles.suggestions}>
              {buildSuggestions(place.name, meta.labelFr).map((q) => (
                <Pressable
                  key={q}
                  style={styles.suggestionChip}
                  onPress={() => { setChatInput(q); }}
                >
                  <Text style={styles.suggestionText}>{q}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder={t('place_chat_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={handleSendChat}
              returnKeyType="send"
              multiline={false}
            />
            <Pressable
              style={[styles.sendBtn, (!chatInput.trim() || chatLoading) && styles.sendBtnDisabled]}
              onPress={handleSendChat}
              disabled={!chatInput.trim() || chatLoading}
            >
              <Text style={styles.sendText}>{t('place_chat_send')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CommunityReviews({ stats }: { stats: { loved: number; neutral: number; disliked: number; total: number } }) {
  const pct = (n: number) => Math.round((n / stats.total) * 100);
  return (
    <View style={reviewStyles.box}>
      <Text style={reviewStyles.title}>👥 Avis de la communauté</Text>
      <Text style={reviewStyles.count}>{stats.total} avis</Text>
      {([
        { key: 'loved', emoji: '❤️', label: 'Adoré', value: stats.loved },
        { key: 'neutral', emoji: '😐', label: 'Correct', value: stats.neutral },
        { key: 'disliked', emoji: '👎', label: 'Déçu', value: stats.disliked },
      ] as const).map(({ emoji, label, value, key }) => (
        <View key={key} style={reviewStyles.row}>
          <Text style={reviewStyles.emoji}>{emoji}</Text>
          <Text style={reviewStyles.label}>{label}</Text>
          <View style={reviewStyles.barBg}>
            <View
              style={[
                reviewStyles.barFill,
                { width: `${pct(value)}%` as `${number}%`, opacity: value === 0 ? 0.15 : 1 },
                key === 'loved' ? reviewStyles.fillLoved : key === 'neutral' ? reviewStyles.fillNeutral : reviewStyles.fillDisliked,
              ]}
            />
          </View>
          <Text style={reviewStyles.pct}>{pct(value)}%</Text>
        </View>
      ))}
    </View>
  );
}

const reviewStyles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  title: { ...typography.heading, color: colors.textPrimary },
  count: { ...typography.caption, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji: { fontSize: 16, width: 22 },
  label: { ...typography.caption, color: colors.textSecondary, width: 52 },
  barBg: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 3 },
  fillLoved: { backgroundColor: '#e25555' },
  fillNeutral: { backgroundColor: '#8a8a9a' },
  fillDisliked: { backgroundColor: '#5b8dd9' },
  pct: { ...typography.label, color: colors.textMuted, width: 36, textAlign: 'right' },
});

function SimilarPlaces({
  currentId, lat, lng, universe, onOpen,
}: {
  currentId: string;
  lat: number;
  lng: number;
  universe: Universe;
  onOpen: (np: NearbyPlace) => void;
}) {
  const [items, setItems] = useState<NearbyPlace[]>([]);
  useEffect(() => {
    let active = true;
    fetchNearby({ lat, lng, radius: 4000, universe, limit: 8 })
      .then((res) => { if (active) setItems(res.filter((p) => p.id !== currentId).slice(0, 6)); })
      .catch(() => {});
    return () => { active = false; };
  }, [currentId, lat, lng, universe]);

  if (items.length === 0) return null;
  return (
    <View style={similarStyles.wrap}>
      <Text style={similarStyles.title}>Dans le même esprit</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={similarStyles.row}>
        {items.map((p) => (
          <Pressable key={p.id} style={similarStyles.card} onPress={() => onOpen(p)}>
            {p.photoUrls?.[0] ? (
              <Image source={{ uri: p.photoUrls[0] }} style={similarStyles.img} contentFit="cover" cachePolicy="memory-disk" recyclingKey={p.photoUrls[0]} />
            ) : (
              <View style={[similarStyles.img, similarStyles.imgPlaceholder]}>
                <Text style={{ fontSize: 28 }}>{placeEmoji(p.universe, p.tags)}</Text>
              </View>
            )}
            <Text style={similarStyles.name} numberOfLines={1}>{p.name}</Text>
            <Text style={similarStyles.meta}>⭐ {p.rating.toFixed(1)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const bizStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: `${colors.brand}14`, borderColor: colors.brand, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: spacing.sm,
  },
  emoji: { fontSize: 16 },
  label: { ...typography.caption, color: colors.brandSoft, fontWeight: '600' },
});

const similarStyles = StyleSheet.create({
  wrap: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  title: { ...typography.heading, color: colors.textPrimary, marginBottom: spacing.sm },
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  card: { width: 130 },
  img: { width: 130, height: 90, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.caption, color: colors.textPrimary, fontWeight: '600', marginTop: 4 },
  meta: { ...typography.label, color: colors.textMuted },
});

function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function buildSuggestions(name: string, universeLabel: string): string[] {
  return [
    `C'est quoi l'ambiance à ${name} ?`,
    `Quel est le meilleur moment pour y aller ?`,
    `Des conseils pour ma visite ${universeLabel.toLowerCase()} ?`,
  ];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.body, color: colors.danger, padding: spacing.lg },

  hero: {
    height: 240,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: { borderRadius: 0 },
  heroScrim: { backgroundColor: 'rgba(0,0,0,0.28)' },
  backBtn: { position: 'absolute', left: spacing.md, padding: spacing.sm },
  backText: { ...typography.heading, color: '#fff', fontSize: 22 },
  heroEmoji: { fontSize: 88 },
  compatBadge: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  compatText: { ...typography.label },
  photoStrip: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  photoThumb: {
    width: 100,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
  },

  body: { padding: spacing.lg, gap: spacing.sm },
  name: { ...typography.display, color: colors.textPrimary },
  meta: { ...typography.body, color: colors.textMuted },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rating: { ...typography.heading, color: colors.textPrimary },
  city: { ...typography.caption, color: colors.textMuted },
  reason: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  tagsRow: { gap: spacing.xs, paddingVertical: spacing.xs },
  tag: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: { ...typography.label, color: colors.textSecondary },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  actionBtnActive: { backgroundColor: `${colors.danger}18`, borderColor: colors.danger },
  actionText: { ...typography.caption, color: colors.textPrimary },

  feedbackBox: { marginTop: spacing.sm, gap: spacing.sm },
  feedbackPrompt: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  feedbackRow: { flexDirection: 'row', gap: spacing.sm },
  feedbackBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  feedbackEmoji: { fontSize: 24 },
  feedbackLabel: { ...typography.label, color: colors.textSecondary },
  feedbackBtnActive: {
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: `${colors.brand}18`,
  },
  notesInput: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  confirmVisitBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  confirmVisitText: { ...typography.body, color: '#fff', fontWeight: '700' },
  visitBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  visitBtnDone: { backgroundColor: `${colors.success}33` },
  visitText: { ...typography.heading, color: '#fff' },
  visitTextDone: { color: colors.success },
  photoUploadBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  photoUploadText: { ...typography.caption, color: colors.textSecondary },
  buttonDisabled: { opacity: 0.5 },

  chatSection: {
    margin: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  chatTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  messages: { padding: spacing.md, gap: spacing.sm },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
  },
  bubbleAi: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bubbleText: { ...typography.body },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAi: { color: colors.textPrimary },
  thinkingText: { ...typography.caption, color: colors.textMuted },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionChip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionText: { ...typography.caption, color: colors.textSecondary },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  chatInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  sendBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { ...typography.caption, color: '#fff' },
});
