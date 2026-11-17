/**
 * PLACE DETAIL — fiche complète d'un lieu avec mini-chat IA.
 * Les données arrivent via placeStore (module singleton) pour éviter
 * la sérialisation d'objets complexes dans les URL params.
 *
 * Mise en scène (17/11/2026) : galerie photo plein écran en parallaxe
 * (PlaceHero), fiche qui remonte par-dessus avec un bord arrondi, nom en
 * très grand, pastilles (univers aux couleurs de sa catégorie, note,
 * distance, ouvert/fermé, compatibilité), panneaux vitrés, sections révélées
 * en cascade et barre « J'y vais / Réserver » collée en bas. Logique, appels
 * réseau et fonctions identiques à la version précédente.
 */
import { useCallback, useState, useRef, useEffect } from 'react';
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
  Alert,
  Keyboard,
  I18nManager,
  useWindowDimensions,
} from 'react-native';
import type { TextInputInstance } from 'react-native';
import Animated, {
  FadeInDown, useAnimatedRef, useAnimatedScrollHandler, useSharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { VisitFeedback } from '../lib/passport-api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { safeMeta, universeLabel } from '../lib/universeMeta';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { universeGradient } from '../lib/universeTheme';
import { UniverseGlyph } from '../components/UniverseGlyph';
import { PlaceHero } from '../components/place/PlaceHero';
import { PressableScale, Reveal } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';
import { useSaved } from '../lib/useSaved';
import { placeStore } from '../lib/place-store';
import { recordVisit } from '../lib/passport-api';
import { Linking } from 'react-native';
import { openExternalHttps } from '../lib/external-link';
import * as ImagePicker from 'expo-image-picker';
import { haptics } from '../lib/useHaptics';
import { askAboutPlace } from '../lib/chat-api';
import { ensureAiConsent } from '../lib/ai-consent';
import { XpToast } from '../components/XpToast';
import { PhotoViewer } from '../components/PhotoViewer';
import { usePlaceStats } from '../lib/usePlaceStats';
import { fetchPlaceById, fetchPlaceDetails, fetchNearby, uploadPlacePhoto, type PlaceDetails } from '../lib/places-api';
import { fetchAffiliateProviders, fetchBookingLink } from '../lib/affiliates-api';
import { affiliateProviderLabel } from '../lib/affiliate-labels';
import type { NearbyPlace } from '../lib/places-api';
import type { VisitResult } from '../lib/passport-api';
import type { Suggestion, Universe } from '@yumia/shared';
import * as StoreReview from 'expo-store-review';
import { ratingLabel, ratingSuffix } from '../lib/place-rating';
import { FeatureTip } from '../components/FeatureTip';

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
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Position du défilement : pilote la parallaxe (thread UI) et se relit
  // côté JS pour faire remonter le champ d'avis au-dessus du clavier.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const reviewInputRef = useRef<TextInputInstance>(null);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { stats } = usePlaceStats(suggestion?.place.id ?? '');

  // Animations en boucle de l'en-tête arrêtées quand la fiche n'est plus
  // affichée (une autre fiche ouverte par-dessus, par ex.).
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  // Barre d'action du bas masquée pendant la saisie : elle recouvrirait le
  // champ du chat ou de l'avis, remontés au-dessus du clavier.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  /** Ordonnée des boutons de réservation, pour y descendre depuis la barre. */
  const bookingY = useRef(0);

  // Fait remonter le champ d'avis au-dessus du clavier. Sur Android, le
  // clavier redimensionne la fenêtre mais la ScrollView ne suit pas le champ
  // qui a le focus : on écrivait sans voir le texte. On mesure le champ à
  // l'écran une fois le clavier ouvert, et on défile juste de ce qui dépasse.
  const revealReviewInput = useCallback((keyboardHeight: number) => {
    reviewInputRef.current?.measureInWindow((_x, y, _w, h) => {
      const keyboardTop = windowHeight - keyboardHeight;
      const overflow = y + h + spacing.lg - keyboardTop;
      if (overflow > 0) scrollRef.current?.scrollTo({ y: scrollY.value + overflow, animated: true });
    });
  }, [windowHeight, scrollRef, scrollY]);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      if (reviewInputRef.current?.isFocused()) revealReviewInput(e.endCoordinates.height);
    });
    return () => sub.remove();
  }, [revealReviewInput]);

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
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  /** Mon avis sur ce lieu, s'il existe : affiché, modifiable et supprimable. */
  const [myReview, setMyReview] = useState<{ rating: number; body: string | null } | null>(null);
  // Tous les partenaires configurés pour l'univers de ce lieu (pas juste le
  // premier) — un musée par ex. peut avoir GetYourGuide ET Viator, on montre
  // les deux plutôt que d'arbitrairement en cacher un.
  const [affiliateProviders, setAffiliateProviders] = useState<string[]>([]);
  const [bookingLoadingProvider, setBookingLoadingProvider] = useState<string | null>(null);

  // Mon avis sur ce lieu (null si je n'en ai pas laissé).
  useEffect(() => {
    const placeId = suggestion?.place.id;
    if (!accessToken || !placeId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${(await import('../lib/api')).apiBase}/places/${placeId}/reviews/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const text = res.ok ? await res.text() : '';
        const review = text ? (JSON.parse(text) as { rating: number; body: string | null } | null) : null;
        if (!cancelled) setMyReview(review ? { rating: review.rating, body: review.body ?? null } : null);
      } catch {
        // silencieux : sans réseau, le bouton « Écrire un avis » reste proposé
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, suggestion?.place.id]);

  // Partenaires de réservation dispo pour ce lieu (silencieux si aucun — la
  // plupart des univers n'en ont pas, ce n'est pas une erreur).
  useEffect(() => {
    const placeId = suggestion?.place.id;
    if (!accessToken || !placeId) return;
    fetchAffiliateProviders(placeId, accessToken)
      .then((providers) => setAffiliateProviders(providers.filter((p) => p.configured).map((p) => p.key)))
      .catch(() => setAffiliateProviders([]));
  }, [accessToken, suggestion?.place.id]);

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
          reason: t('place_opened_via_link'),
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

  // La fiche s'ouvre avec ce que la liste connaissait, puis se complète :
  // horaires (demandés à Google seulement ici, à l'ouverture), photos si le
  // lieu n'en avait pas, et note à jour des utilisateurs de YUMIA.
  const [live, setLive] = useState<PlaceDetails | null>(null);
  useEffect(() => {
    const placeId = suggestion?.place.id;
    setLive(null);
    if (!placeId) return;
    let cancelled = false;
    fetchPlaceDetails(placeId)
      .then((d) => { if (!cancelled) setLive(d); })
      .catch(() => {/* la fiche reste utilisable avec les données de la liste */});
    return () => { cancelled = true; };
  }, [suggestion?.place.id]);

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
          <Text style={styles.backText}>{t('place_back')}</Text>
        </Pressable>
        <Text style={styles.error}>{t('place_not_found')}</Text>
      </View>
    );
  }

  const { place: listed, compatibility, distanceMeters, reason } = suggestion;
  const place = live
    ? {
        ...listed,
        photoUrls: live.photoUrls.length > 0 ? live.photoUrls : listed.photoUrls,
        openingHours: live.openingHours.length > 0 ? live.openingHours : listed.openingHours,
        rating: live.rating,
      }
    : listed;
  const meta = safeMeta(place.universe);
  const isSaved = savedIds.has(place.id);
  // Attributions Google Maps Platform (CGU) : l'auteur de la photo affichée
  // en grand, et « Google Maps » pour les données et photos issues de Places.
  const heroAuthor = live && live.photoUrls.length > 0 ? live.photoAttributions?.[0] ?? null : null;
  const showGoogleAttribution = live?.googleAttribution
    ?? (place.photoUrls ?? []).some((u) => u.includes('/places/photo'));

  async function handleBooking(provider: string) {
    if (!accessToken || bookingLoadingProvider) return;
    setBookingLoadingProvider(provider);
    try {
      const url = await fetchBookingLink(place.id, provider, accessToken);
      await openExternalHttps(url);
    } catch {
      // Silencieux : pas grave si un lien échoue à se générer, l'utilisateur
      // n'a juste pas de bouton qui répond, pas de crash.
    } finally {
      setBookingLoadingProvider(null);
    }
  }

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
      message: t('place_share_message')
        .replace('{emoji}', meta.emoji)
        .replace('{name}', place.name)
        .replace('{link}', `yumia://place?id=${place.id}`),
      title: place.name,
      url: `yumia://place?id=${place.id}`,
    });
  }

  function handleOpenMaps() {
    const { lat, lng } = place.location;
    const label = encodeURIComponent(place.name);
    const url = Platform.OS === 'ios'
      ? `https://maps.apple.com/?q=${label}&ll=${lat},${lng}`
      : `https://maps.google.com/?q=${lat},${lng}`;
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
    // Réponse rédigée par Claude (Anthropic) : accord explicite d'abord.
    if (!(await ensureAiConsent())) {
      setMessages((prev) => [...prev, { role: 'ai', text: t('ai_consent_feature_off') }]);
      return;
    }
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
        { role: 'ai', text: t('place_chat_error') },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  const compatColor = compatibility >= 85 ? colors.compatHigh : colors.compatMid;
  const grad = universeGradient(place.universe);
  const photos = place.photoUrls ?? [];
  const heroHeight = Math.min(Math.round(windowHeight * 0.56), 480);

  // Réserver depuis la barre du bas : un seul partenaire → on y va
  // directement ; plusieurs → on descend jusqu'à leurs boutons plutôt que
  // d'en choisir un arbitrairement.
  function handleStickyBook() {
    if (affiliateProviders.length === 1) {
      void handleBooking(affiliateProviders[0]);
      return;
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, bookingY.current - spacing.xl), animated: true });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.bottom}
    >
      <XpToast result={xpResult} onDone={() => setXpResult(null)} />
      {photos.length > 0 && photoViewerIndex !== null ? (
        <PhotoViewer
          photos={photos}
          initialIndex={photoViewerIndex}
          visible={true}
          onClose={() => setPhotoViewerIndex(null)}
        />
      ) : null}
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* ── Galerie plein écran ─────────────────────────────────────── */}
        <PlaceHero
          photos={photos}
          universe={place.universe}
          width={windowWidth}
          height={heroHeight}
          topInset={insets.top}
          scrollY={scrollY}
          focused={focused}
          isSaved={isSaved}
          onOpenPhoto={(i) => setPhotoViewerIndex(i)}
          onBack={() => router.back()}
          onShare={() => void handleShare()}
          onToggleSave={accessToken ? () => void handleSave() : undefined}
          credit={heroAuthor ? (
            <Pressable
              style={styles.photoCredit}
              hitSlop={6}
              disabled={!heroAuthor.uri}
              onPress={() => { if (heroAuthor.uri) void openExternalHttps(heroAuthor.uri).catch(() => {}); }}
              accessibilityRole={heroAuthor.uri ? 'link' : 'text'}
            >
              <Text style={styles.photoCreditText} numberOfLines={1}>
                {t('place_photo_by').replace('{name}', heroAuthor.displayName)}
              </Text>
            </Pressable>
          ) : null}
        />

        {/* ── Fiche, qui remonte par-dessus la photo ──────────────────── */}
        <View style={styles.sheet}>
          <Reveal index={0} style={styles.titleBlock}>
            <View style={styles.universePillWrap}>
              <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.universePill}>
                <UniverseGlyph u={place.universe} size={16} />
                <Text style={styles.universePillText} numberOfLines={1}>{universeLabel(t, place.universe)}</Text>
              </LinearGradient>
            </View>
            <Text style={styles.name}>{place.name}</Text>

            <View style={styles.pills}>
              {place.rating > 0 ? (
                <View style={styles.pill}><Text style={styles.pillText}>{ratingLabel(place.rating)}</Text></View>
              ) : null}
              {distanceMeters != null && distanceMeters > 0 ? (
                <View style={styles.pill}><Text style={styles.pillText}>📍 {formatDistance(distanceMeters)}</Text></View>
              ) : null}
              {place.openNow !== undefined ? (
                <View style={[styles.pill, { borderColor: place.openNow ? colors.success : colors.danger }]}>
                  <View style={[styles.statusDot, { backgroundColor: place.openNow ? colors.success : colors.danger }]} />
                  <Text style={[styles.pillText, { color: place.openNow ? colors.success : colors.danger }]}>
                    {place.openNow ? t('place_open') : t('place_closed')}
                  </Text>
                </View>
              ) : null}
              {compatibility > 0 ? (
                <View style={[styles.pill, { borderColor: compatColor }]}>
                  <Text style={[styles.pillText, { color: compatColor }]}>❤️ {compatibility}%</Text>
                </View>
              ) : null}
              {place.city ? (
                <View style={styles.pill}><Text style={styles.pillText} numberOfLines={1}>{place.city}</Text></View>
              ) : null}
            </View>
            {showGoogleAttribution ? (
              <Text style={styles.googleAttribution}>{t('place_data_google')}</Text>
            ) : null}
          </Reveal>

          {/* Boutons de réservation partenaire — en haut de la fiche, visibles
              sans défiler, un par partenaire configuré pour l'univers. */}
          {affiliateProviders.length > 0 && (
            // onLayout sur l'enfant direct de la fiche : y est alors mesuré
            // depuis le haut de la fiche, qui commence 28 px au-dessus du bas
            // de la galerie.
            <View onLayout={(e) => { bookingY.current = e.nativeEvent.layout.y + heroHeight - 28; }}>
            <Reveal index={1}>
              <View style={bizStyles.bookingRow}>
                {affiliateProviders.map((provider) => (
                  <PressableScale
                    key={provider}
                    style={bizStyles.bookingBtn}
                    onPress={() => void handleBooking(provider)}
                    disabled={bookingLoadingProvider === provider}
                    haptic
                  >
                    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    {bookingLoadingProvider === provider
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={bizStyles.bookingLabel}>🎟️ {t('place_book_on').replace('{provider}', affiliateProviderLabel(provider))}</Text>}
                  </PressableScale>
                ))}
              </View>
            </Reveal>
            </View>
          )}

          {/* Pourquoi YUMIA propose ce lieu */}
          {reason ? (
            <Reveal index={2}>
              <View style={styles.reasonCard}>
                <LinearGradient colors={gradients.brandSoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <View style={styles.reasonIcon}><Text style={styles.reasonIconText}>✨</Text></View>
                <Text style={styles.reason}>{reason}</Text>
              </View>
            </Reveal>
          ) : null}

          {/* Actions — quatre tuiles égales, icône au-dessus du libellé. Les
              icônes sont posées ici ; on retire celle que portent certains
              libellés traduits pour ne pas l'afficher deux fois. */}
          <Reveal index={3}>
            <View style={styles.actions}>
              {([
                { key: 'save', icon: isSaved ? '❤️' : '🤍', label: isSaved ? t('place_saved_btn') : t('place_save_btn'), onPress: handleSave, active: isSaved },
                { key: 'share', icon: '📤', label: t('place_share_btn'), onPress: handleShare },
                { key: 'maps', icon: '🗺️', label: t('place_maps_btn'), onPress: handleOpenMaps },
                {
                  key: 'calendar',
                  icon: '🗓️',
                  label: t('place_calendar_btn'),
                  // Le calendrier récupère nom, adresse et catégorie du lieu :
                  // plus rien à ressaisir. La catégorie dépend de l'univers.
                  onPress: () => router.push(
                    `/calendar?title=${encodeURIComponent(place.name)}`
                    + `&placeId=${encodeURIComponent(place.id)}`
                    + `&placeName=${encodeURIComponent(place.name)}`
                    + `&address=${encodeURIComponent(place.city ?? '')}`
                    + `&category=${calendarCategoryFor(place.universe)}` as never,
                  ),
                },
              ] as { key: string; icon: string; label: string; onPress: () => void; active?: boolean }[]).map((a) => (
                <PressableScale
                  key={a.key}
                  style={[styles.actionBtn, a.active && styles.actionBtnActive]}
                  onPress={a.onPress}
                  scaleTo={0.92}
                >
                  <View style={[styles.actionIconWrap, a.active && styles.actionIconWrapActive]}>
                    <Text style={styles.actionIcon}>{a.icon}</Text>
                  </View>
                  <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {a.label.replace(/^[^\p{L}]+/u, '')}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </Reveal>

          {place.tags && place.tags.length > 0 ? (
            <Reveal index={4}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsRow}>
                {place.tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </ScrollView>
            </Reveal>
          ) : null}

          {place.openingHours && place.openingHours.length > 0 ? (
            <Reveal index={5}>
              <View style={hoursStyles.box}>
                <Pressable style={hoursStyles.header} onPress={() => setHoursExpanded((v) => !v)}>
                  <View style={hoursStyles.headerText}>
                    <Text style={hoursStyles.title}>{t('place_hours_title')}</Text>
                    {!hoursExpanded ? (
                      (() => {
                        const todayIdx = (new Date().getDay() + 6) % 7;
                        const entry = place.openingHours[todayIdx];
                        if (!entry) return null;
                        const colonIdx = entry.indexOf(': ');
                        return (
                          <Text style={hoursStyles.todayLine}>
                            {t('place_hours_today')} {formatHoursLine(colonIdx >= 0 ? entry.slice(colonIdx + 2) : entry, t('place_closed_word'))}
                          </Text>
                        );
                      })()
                    ) : null}
                  </View>
                  <View style={hoursStyles.toggleWrap}>
                    <Text style={hoursStyles.toggle}>{hoursExpanded ? '▲' : '▼'}</Text>
                  </View>
                </Pressable>
                {hoursExpanded ? (
                  <View style={hoursStyles.list}>
                    {place.openingHours.map((line, i) => {
                      const isToday = i === (new Date().getDay() + 6) % 7;
                      const colonIdx = line.indexOf(': ');
                      const dayName = colonIdx >= 0 ? line.slice(0, colonIdx) : '';
                      const timeRange = colonIdx >= 0 ? line.slice(colonIdx + 2) : line;
                      return (
                        <View key={i} style={[hoursStyles.row, isToday && hoursStyles.rowToday]}>
                          <Text style={[hoursStyles.day, isToday && hoursStyles.dayToday]}>{dayName}</Text>
                          <Text style={[hoursStyles.time, isToday && hoursStyles.timeToday]}>{formatHoursLine(timeRange, t('place_closed_word'))}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </Reveal>
          ) : null}

          {/* Visite : « J'y suis allé » → ressenti → XP */}
          {accessToken ? (
            <Reveal index={6}>
              {visitState === 'feedback' || visitState === 'submitting' ? (
                <View style={styles.feedbackBox}>
                  <Text style={styles.feedbackPrompt}>{t('place_feedback_prompt')}</Text>
                  <View style={styles.feedbackRow}>
                    {([
                      { key: 'loved' as VisitFeedback, emoji: '❤️', label: t('place_feedback_loved') },
                      { key: 'neutral' as VisitFeedback, emoji: '😐', label: t('place_feedback_neutral') },
                      { key: 'disliked' as VisitFeedback, emoji: '👎', label: t('place_feedback_disliked') },
                    ]).map((opt) => (
                      <PressableScale
                        key={opt.key}
                        style={[styles.feedbackBtn, selectedFeedback === opt.key && styles.feedbackBtnActive]}
                        onPress={() => setSelectedFeedback(selectedFeedback === opt.key ? null : opt.key)}
                        scaleTo={0.92}
                      >
                        <Text style={styles.feedbackEmoji}>{opt.emoji}</Text>
                        <Text style={styles.feedbackLabel}>{opt.label}</Text>
                      </PressableScale>
                    ))}
                  </View>
                  <TextInput
                    style={styles.notesInput}
                    placeholder={t('place_notes_placeholder')}
                    placeholderTextColor={colors.textMuted}
                    value={visitNotes}
                    onChangeText={setVisitNotes}
                    maxLength={500}
                    multiline
                    numberOfLines={2}
                  />
                  <PressableScale
                    style={[styles.confirmVisitBtn, visitState === 'submitting' && styles.buttonDisabled]}
                    onPress={handleConfirmVisit}
                    disabled={visitState === 'submitting'}
                    haptic
                  >
                    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    {visitState === 'submitting'
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.confirmVisitText}>{t('place_confirm_visit')}</Text>
                    }
                  </PressableScale>
                </View>
              ) : (
                <PressableScale
                  style={[styles.visitBtn, visitState === 'done' && styles.visitBtnDone]}
                  onPress={handleVisit}
                  disabled={visitState !== 'idle'}
                  scaleTo={0.97}
                  haptic
                >
                  {visitState !== 'done' ? (
                    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  ) : null}
                  <Text style={[styles.visitText, visitState === 'done' && styles.visitTextDone]}>
                    {visitState === 'done' ? t('place_visited') : t('place_visit_btn')}
                  </Text>
                </PressableScale>
              )}

              {visitState === 'done' ? (
                <PressableScale
                  style={[styles.photoUploadBtn, uploading && styles.buttonDisabled]}
                  onPress={handleAddPhoto}
                  disabled={uploading || uploadSuccess}
                >
                  {uploading ? (
                    <ActivityIndicator color={colors.brand} size="small" />
                  ) : (
                    <Text style={styles.photoUploadText}>
                      {uploadSuccess ? t('place_photo_added') : t('place_add_photo')}
                    </Text>
                  )}
                </PressableScale>
              ) : null}
            </Reveal>
          ) : null}

          {/* Réserver autour de ce lieu (guides). « Sorties & billets » retiré
              temporairement (paiement Stripe pas encore branché) — voir
              sorties.tsx, code conservé. */}
          <Reveal index={7}>
            <PressableScale
              style={bizStyles.guideTile}
              onPress={() => router.push(`/guides${place.city ? `?city=${encodeURIComponent(place.city)}` : ''}` as never)}
              scaleTo={0.97}
            >
              <LinearGradient colors={gradients.shop} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
              <Text style={bizStyles.guideEmoji}>🧭</Text>
              <Text style={bizStyles.guideLabel} numberOfLines={2}>{t('place_guide_here')}</Text>
              <Text style={bizStyles.guideArrow}>{I18nManager.isRTL ? '‹' : '›'}</Text>
            </PressableScale>
          </Reveal>

          {stats && stats.total > 0 ? (
            <Reveal index={8}>
              <CommunityReviews stats={stats} />
            </Reveal>
          ) : null}

          {/* Section Avis utilisateurs */}
          {accessToken ? (
            <Reveal index={9}>
              <View style={reviewFormStyles.section}>
                <View style={reviewFormStyles.header}>
                  <Text style={reviewFormStyles.title}>{t(myReview && !reviewModal ? 'place_your_review' : 'place_leave_review')}</Text>
                </View>
                {reviewModal ? (
                  <View style={reviewFormStyles.form}>
                    {/* Étoiles */}
                    <View style={reviewFormStyles.stars}>
                      {[1,2,3,4,5].map((n) => (
                        <Pressable key={n} onPress={() => setReviewRating(n)} hitSlop={8}>
                          <Text style={reviewFormStyles.star}>{n <= reviewRating ? '⭐' : '☆'}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      ref={reviewInputRef}
                      style={reviewFormStyles.input}
                      placeholder={t('place_review_placeholder')}
                      placeholderTextColor={colors.textMuted}
                      value={reviewBody}
                      onChangeText={setReviewBody}
                      multiline
                      numberOfLines={3}
                    />
                    <View style={reviewFormStyles.formBtns}>
                      <Pressable style={reviewFormStyles.cancelBtn} onPress={() => setReviewModal(false)}>
                        <Text style={reviewFormStyles.cancelText}>{t('place_cancel')}</Text>
                      </Pressable>
                      <Pressable
                        style={[reviewFormStyles.submitBtn, (reviewRating === 0 || reviewSubmitting) && reviewFormStyles.submitDisabled]}
                        disabled={reviewRating === 0 || reviewSubmitting}
                        onPress={async () => {
                          if (reviewRating === 0 || !accessToken) return;
                          setReviewSubmitting(true);
                          try {
                            const body = reviewBody.trim();
                            const res = await fetch(`${(await import('../lib/api')).apiBase}/places/${place.id}/reviews`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                              body: JSON.stringify({ rating: reviewRating, body: body || undefined }),
                            });
                            if (!res.ok) {
                              // Avant, un refus (texte modéré, note invalide, session
                              // expirée…) fermait le formulaire comme un succès :
                              // « laisser un avis ne marche pas ». On affiche le
                              // motif du serveur et on garde la saisie.
                              let message = t('error_generic');
                              try {
                                const err = (await res.json()) as { message?: string | string[] };
                                const m = Array.isArray(err.message) ? err.message[0] : err.message;
                                if (typeof m === 'string' && m) message = m;
                              } catch { /* corps non JSON : message générique */ }
                              Alert.alert(t('place_leave_review'), message);
                              return;
                            }
                            Keyboard.dismiss();
                            setMyReview({ rating: reviewRating, body: body || null });
                            setReviewModal(false);
                            setReviewBody('');
                            setReviewRating(0);
                          } catch {
                            Alert.alert(t('place_leave_review'), t('error_generic'));
                          } finally {
                            setReviewSubmitting(false);
                          }
                        }}
                      >
                        <Text style={reviewFormStyles.submitText}>{reviewSubmitting ? '…' : t('place_publish')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : myReview ? (
                  // Mon avis existant : je peux le modifier ou le supprimer.
                  <View style={reviewFormStyles.form}>
                    <Text style={reviewFormStyles.star}>{'⭐'.repeat(myReview.rating)}{'☆'.repeat(5 - myReview.rating)}</Text>
                    {myReview.body ? <Text style={reviewFormStyles.myBody}>{myReview.body}</Text> : null}
                    <View style={reviewFormStyles.formBtns}>
                      <Pressable
                        style={reviewFormStyles.cancelBtn}
                        onPress={() => {
                          Alert.alert(t('place_delete_review_title'), t('place_delete_review_body'), [
                            { text: t('place_cancel'), style: 'cancel' },
                            {
                              text: t('chat_delete'),
                              style: 'destructive',
                              onPress: async () => {
                                if (!accessToken) return;
                                try {
                                  const res = await fetch(`${(await import('../lib/api')).apiBase}/places/${place.id}/reviews/me`, {
                                    method: 'DELETE',
                                    headers: { Authorization: `Bearer ${accessToken}` },
                                  });
                                  if (res.ok) setMyReview(null);
                                } catch {
                                  // réseau : l'avis reste affiché, on peut réessayer
                                }
                              },
                            },
                          ]);
                        }}
                      >
                        <Text style={reviewFormStyles.deleteText}>{t('chat_delete')}</Text>
                      </Pressable>
                      <Pressable
                        style={reviewFormStyles.submitBtn}
                        onPress={() => {
                          setReviewRating(myReview.rating);
                          setReviewBody(myReview.body ?? '');
                          setReviewModal(true);
                        }}
                      >
                        <Text style={reviewFormStyles.submitText}>{t('place_edit_review')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable style={reviewFormStyles.openBtn} onPress={() => setReviewModal(true)}>
                    <Text style={reviewFormStyles.openBtnText}>{t('place_write_review')}</Text>
                  </Pressable>
                )}
              </View>
            </Reveal>
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
                  photoUrls: np.photoUrls, tags: np.tags, openingHours: np.openingHours,
                },
                compatibility: 0,
                distanceMeters: np.distanceMeters,
                reason: `${safeMeta(np.universe).emoji} ${universeLabel(t, np.universe)}${ratingSuffix(np.rating)}`,
                engine: 'mood',
              });
              router.push('/place');
            }}
          />

          {/* Mini-chat IA */}
          <Reveal index={10}>
            <View style={styles.chatSection}>
              <View style={styles.chatHeader}>
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chatHeaderIcon}>
                  <Text style={styles.chatHeaderIconText}>✨</Text>
                </LinearGradient>
                <Text style={styles.chatTitle}>{t('place_chat_title')}</Text>
              </View>

              {messages.length > 0 ? (
                <View style={styles.messages}>
                  {messages.map((msg, i) => (
                    msg.role === 'user' ? (
                      <Animated.View key={i} entering={FadeInDown.duration(220)} style={[styles.bubble, styles.bubbleUser]}>
                        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{msg.text}</Text>
                      </Animated.View>
                    ) : (
                      <Animated.View key={i} entering={FadeInDown.duration(220)} style={[styles.bubble, styles.bubbleAi]}>
                        <Text style={[styles.bubbleText, styles.bubbleTextAi]}>{msg.text}</Text>
                      </Animated.View>
                    )
                  ))}
                  {chatLoading ? (
                    <View style={[styles.bubble, styles.bubbleAi]}>
                      <ActivityIndicator color={colors.brand} size="small" />
                      <Text style={styles.thinkingText}>{t('place_chat_thinking')}</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                /* Suggestions rapides quand le chat est vide */
                <View style={styles.suggestions}>
                  {buildSuggestions(t, place.name, universeLabel(t, place.universe)).map((q) => (
                    <PressableScale
                      key={q}
                      style={styles.suggestionChip}
                      onPress={() => { setChatInput(q); }}
                    >
                      <Text style={styles.suggestionText}>{q}</Text>
                    </PressableScale>
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
                <PressableScale
                  style={[styles.sendBtn, (!chatInput.trim() || chatLoading) && styles.sendBtnDisabled]}
                  onPress={handleSendChat}
                  disabled={!chatInput.trim() || chatLoading}
                >
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Text style={styles.sendText}>{t('place_chat_send')}</Text>
                </PressableScale>
              </View>
            </View>
          </Reveal>
        </View>
      </Animated.ScrollView>

      {/* ── Barre d'action collée en bas ───────────────────────────────── */}
      {!keyboardOpen ? (
        <Animated.View
          entering={FadeInDown.delay(250).duration(320)}
          style={[styles.stickyBar, { paddingBottom: insets.bottom + spacing.sm }]}
        >
          <PressableScale style={styles.stickyBtnGhost} onPress={handleOpenMaps} scaleTo={0.96}>
            <Text style={styles.stickyGhostText} numberOfLines={1}>🧭 {t('go_there')}</Text>
          </PressableScale>
          {affiliateProviders.length > 0 ? (
            <PressableScale
              style={styles.stickyBtn}
              onPress={handleStickyBook}
              disabled={bookingLoadingProvider !== null}
              scaleTo={0.96}
              haptic
            >
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              {bookingLoadingProvider !== null
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.stickyBtnText} numberOfLines={1}>🎟️ {t('sor_book')}</Text>}
            </PressableScale>
          ) : accessToken ? (
            <PressableScale style={styles.stickyBtn} onPress={() => void handleSave()} scaleTo={0.96} haptic>
              {!isSaved ? (
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              ) : null}
              <Text style={[styles.stickyBtnText, isSaved && styles.stickyBtnTextSaved]} numberOfLines={1}>
                {isSaved ? t('place_saved_btn') : t('place_save_btn')}
              </Text>
            </PressableScale>
          ) : null}
        </Animated.View>
      ) : null}
      <FeatureTip feature="place" />
    </KeyboardAvoidingView>
  );
}

function CommunityReviews({ stats }: { stats: { loved: number; neutral: number; disliked: number; total: number } }) {
  const { t } = useI18n();
  const pct = (n: number) => Math.round((n / stats.total) * 100);
  return (
    <View style={reviewStyles.box}>
      <View style={reviewStyles.head}>
        <Text style={reviewStyles.title}>{t('place_community_reviews')}</Text>
        <Text style={reviewStyles.count}>{t('place_reviews_count').replace('{n}', String(stats.total))}</Text>
      </View>
      {([
        { key: 'loved', emoji: '❤️', label: t('place_feedback_loved'), value: stats.loved },
        { key: 'neutral', emoji: '😐', label: t('place_feedback_neutral'), value: stats.neutral },
        { key: 'disliked', emoji: '👎', label: t('place_feedback_disliked'), value: stats.disliked },
      ] as const).map(({ emoji, label, value, key }) => (
        <View key={key} style={reviewStyles.row}>
          <Text style={reviewStyles.emoji}>{emoji}</Text>
          <Text style={reviewStyles.label} numberOfLines={1}>{label}</Text>
          <View style={reviewStyles.barBg}>
            <View style={[reviewStyles.barFill, { width: `${pct(value)}%` as `${number}%`, opacity: value === 0 ? 0.15 : 1 }]}>
              <LinearGradient
                colors={key === 'loved' ? gradients.brand : key === 'neutral' ? [colors.textMuted, colors.textSecondary] : [colors.accent, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </View>
          <Text style={reviewStyles.pct}>{pct(value)}%</Text>
        </View>
      ))}
    </View>
  );
}

const reviewStyles = StyleSheet.create({
  box: {
    ...glassPanel(),
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...typography.heading, color: colors.textPrimary, flexShrink: 1 },
  count: { ...typography.caption, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emoji: { fontSize: 16, width: 22 },
  label: { ...typography.caption, color: colors.textSecondary, width: 58 },
  barBg: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4, overflow: 'hidden' },
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
  const { t } = useI18n();
  const [items, setItems] = useState<NearbyPlace[]>([]);
  useEffect(() => {
    let active = true;
    fetchNearby({ lat, lng, radius: 4000, universe, limit: 8 })
      .then((res) => { if (active) setItems(res.filter((p) => p.id !== currentId).slice(0, 6)); })
      .catch(() => {});
    return () => { active = false; };
  }, [currentId, lat, lng, universe]);

  if (items.length === 0) return null;
  const grad = universeGradient(universe);
  return (
    <Reveal style={similarStyles.wrap} from="fade">
      <Text style={similarStyles.title}>{t('place_similar_title')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={similarStyles.row}>
        {items.map((p, i) => (
          <Reveal key={p.id} index={i} from="fade">
            <PressableScale style={similarStyles.card} onPress={() => onOpen(p)} scaleTo={0.95}>
              {p.photoUrls?.[0] ? (
                <Image source={{ uri: p.photoUrls[0] }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={p.photoUrls[0]} />
              ) : (
                <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, similarStyles.imgPlaceholder]}>
                  <UniverseGlyph u={p.universe} size={40} />
                </LinearGradient>
              )}
              <LinearGradient colors={gradients.scrim} locations={[0.35, 0.8, 1]} style={StyleSheet.absoluteFill} />
              <View style={similarStyles.info}>
                <Text style={similarStyles.name} numberOfLines={2}>{p.name}</Text>
                <Text style={similarStyles.meta} numberOfLines={1}>
                  {[ratingLabel(p.rating), p.distanceMeters > 0 ? formatDistance(p.distanceMeters) : ''].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </PressableScale>
          </Reveal>
        ))}
      </ScrollView>
    </Reveal>
  );
}

/** Panneau vitré : surface translucide + liseré lumineux (glass.card). */
function glassPanel() {
  return {
    backgroundColor: 'rgba(31,31,42,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
  } as const;
}

const bizStyles = StyleSheet.create({
  bookingRow: { marginTop: spacing.md, gap: spacing.sm },
  bookingBtn: {
    height: 52, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  bookingLabel: { ...typography.body, color: '#fff', fontWeight: '800' },
  guideTile: {
    marginTop: spacing.md, height: 76, borderRadius: radius.lg, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
  },
  guideEmoji: { fontSize: 30 },
  guideLabel: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '800' },
  guideArrow: { color: '#fff', fontSize: 30, fontWeight: '300' },
});

const similarStyles = StyleSheet.create({
  wrap: { marginTop: spacing.xl },
  title: { fontSize: 20, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.3, marginBottom: spacing.md },
  row: { gap: spacing.md, paddingVertical: spacing.xs },
  card: {
    width: 150, height: 200, borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: colors.surfaceElevated, justifyContent: 'flex-end',
  },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  info: { padding: spacing.sm, gap: 2 },
  name: { color: '#fff', fontSize: 15, fontWeight: '800' },
  meta: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
});

/**
 * Traduit un univers Yumia en catégorie de calendrier.
 *
 * Les 108 univers sont bien plus fins que les 7 catégories d'agenda : on
 * regroupe par intention plutôt que d'imposer « Personnel » à tout le monde.
 */
function calendarCategoryFor(universe: string): string {
  const FOOD = ['restaurant', 'cafe', 'bar', 'bakery', 'brunch', 'dessert', 'pub',
    'ice_cream', 'chocolatier', 'wine_cellar', 'tea_house', 'juice_bar',
    'food_truck', 'butcher', 'rooftop'];
  const STAY = ['hotel', 'camping', 'campground'];
  const SHOW = ['nightclub', 'live_music', 'karaoke', 'comedy_club', 'cinema',
    'event_venue', 'casino'];

  if (FOOD.includes(universe)) return 'restaurant';
  if (STAY.includes(universe)) return 'hotel';
  if (SHOW.includes(universe)) return 'event';
  return 'activity';
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatHoursLine(line: string, closedWord: string): string {
  if (/closed/i.test(line)) return line.replace(/closed/i, closedWord);
  return line.replace(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi, (_, h, min, period) => {
    let hour = parseInt(h, 10);
    if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}h${min}`;
  });
}

function buildSuggestions(t: (key: TranslationKey) => string, name: string, universeLabel: string): string[] {
  return [
    t('place_suggestion_vibe').replace('{name}', name),
    t('place_suggestion_best_time'),
    t('place_suggestion_tips').replace('{universe}', universeLabel.toLowerCase()),
  ];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.body, color: colors.danger, padding: spacing.lg },
  // Écran « lieu introuvable » (sans galerie).
  backBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  backText: { ...typography.heading, color: colors.textPrimary, fontSize: 18 },

  photoCredit: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoCreditText: { fontSize: 10, color: 'rgba(255,255,255,0.9)' },

  // Fiche qui remonte sur la photo : bord arrondi, fond de l'app.
  sheet: {
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  titleBlock: { gap: spacing.sm },
  universePillWrap: { flexDirection: 'row' },
  universePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12, overflow: 'hidden',
  },
  universePillText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  name: { fontSize: 32, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.8, lineHeight: 37 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10, maxWidth: '100%',
  },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  googleAttribution: { fontSize: 11, color: colors.textMuted },

  reasonCard: {
    marginTop: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  reasonIcon: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  reasonIconText: { fontSize: 15 },
  reason: { ...typography.body, color: colors.textPrimary, lineHeight: 22, flex: 1 },

  tagsRow: { gap: spacing.xs, paddingVertical: spacing.xs, marginTop: spacing.md },
  tag: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: { ...typography.label, color: colors.textSecondary },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: {
    flex: 1,
    ...glassPanel(),
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 6,
  },
  actionBtnActive: { backgroundColor: `${colors.danger}1F`, borderColor: colors.danger },
  actionIconWrap: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  actionIconWrapActive: { backgroundColor: `${colors.danger}2E` },
  actionIcon: { fontSize: 20, lineHeight: 24 },
  actionText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },

  feedbackBox: { marginTop: spacing.md, gap: spacing.sm, ...glassPanel(), padding: spacing.md },
  feedbackPrompt: { ...typography.heading, color: colors.textPrimary, textAlign: 'center' },
  feedbackRow: { flexDirection: 'row', gap: spacing.sm },
  feedbackBtn: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  feedbackEmoji: { fontSize: 28 },
  feedbackLabel: { ...typography.label, color: colors.textSecondary },
  feedbackBtnActive: {
    borderColor: colors.brand,
    backgroundColor: `${colors.brand}18`,
  },
  notesInput: {
    backgroundColor: colors.bg,
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
    height: 50,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  confirmVisitText: { ...typography.body, color: '#fff', fontWeight: '800' },
  visitBtn: {
    marginTop: spacing.md,
    height: 58,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitBtnDone: { backgroundColor: `${colors.success}26`, borderWidth: 1, borderColor: colors.success },
  visitText: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  visitTextDone: { color: colors.success },
  photoUploadBtn: {
    marginTop: spacing.sm,
    ...glassPanel(),
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  photoUploadText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },

  chatSection: {
    marginTop: spacing.xl,
    ...glassPanel(),
    overflow: 'hidden',
  },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  chatHeaderIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chatHeaderIconText: { fontSize: 16 },
  chatTitle: { ...typography.heading, color: colors.textPrimary, flex: 1 },
  messages: { padding: spacing.md, gap: spacing.sm },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 6,
  },
  bubbleAi: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderBottomLeftRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bubbleText: { ...typography.body, lineHeight: 21 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAi: { color: colors.textPrimary, flexShrink: 1 },
  thinkingText: { ...typography.caption, color: colors.textMuted },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
  },
  suggestionChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  suggestionText: { ...typography.caption, color: colors.textPrimary },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  chatInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  sendBtn: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { ...typography.caption, color: '#fff', fontWeight: '800' },

  // Barre collée en bas
  stickyBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: spacing.sm,
    paddingTop: spacing.sm, paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(14,14,18,0.94)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  stickyBtnGhost: {
    flex: 1, height: 52, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  stickyGhostText: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  stickyBtn: {
    flex: 1.3, height: 52, borderRadius: radius.pill, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${colors.danger}1F`,
  },
  stickyBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  stickyBtnTextSaved: { color: colors.textPrimary },
});

const hoursStyles = StyleSheet.create({
  box: {
    marginTop: spacing.md,
    ...glassPanel(),
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerText: { flex: 1, gap: 3 },
  title: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  toggleWrap: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  toggle: { ...typography.caption, color: colors.textSecondary },
  todayLine: {
    ...typography.caption,
    color: colors.brandSoft,
    fontWeight: '700',
  },
  list: { paddingBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  rowToday: { backgroundColor: `${colors.brand}18` },
  day: { ...typography.caption, color: colors.textSecondary, width: 90 },
  dayToday: { color: colors.brandSoft, fontWeight: '800' },
  time: { ...typography.caption, color: colors.textSecondary, textAlign: 'right', flexShrink: 1 },
  timeToday: { color: colors.brandSoft, fontWeight: '800' },
});

const reviewFormStyles = StyleSheet.create({
  myBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  deleteText: { color: colors.danger, fontWeight: '700' },
  section: {
    marginTop: spacing.md,
    ...glassPanel(),
    overflow: 'hidden',
  },
  header: {
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  title: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  openBtn: {
    padding: spacing.md,
    alignItems: 'center',
  },
  openBtnText: { ...typography.body, color: colors.brandSoft, fontWeight: '800' },
  form: { padding: spacing.md, gap: spacing.sm },
  stars: { flexDirection: 'row', gap: spacing.sm },
  star: { fontSize: 30 },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  formBtns: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { ...typography.caption, color: colors.textSecondary },
  submitBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { ...typography.caption, color: '#fff', fontWeight: '700' },
});
