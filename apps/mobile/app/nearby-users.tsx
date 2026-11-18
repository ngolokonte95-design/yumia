/**
 * CARTE DES GENS AUTOUR — refonte premium (18/11/2026).
 *
 * Interface refaite AUTOUR de la carte : en-tête au titre dégradé, onglets en
 * pastilles, panneau du bas vitré (visibilité, signal), cartes de profils et
 * de sorties en verre, feuilles du bas sombres. Une seule couleur d'accent
 * (dégradé de marque) ; les couleurs d'intention (dispo / explorer / sortie)
 * restent, elles portent un sens.
 *
 * CARTE : react-native-maps a déjà provoqué des plantages mémoire sur iPhone.
 * Les repères gardent EXACTEMENT la même structure (une vue + un emoji), le
 * même nombre, sans image ; seul leur style change. Logique inchangée
 * (découverte, visibilité opt-in, signal, sorties, suivi, quotas).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import MapView, { Callout, Circle, Marker } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { colors, elevation, gradients, radius, spacing } from '../theme/tokens';
import { socialApi, type DiscoveredUser, type IntentType, type SocialEvent, type SocialIntent } from '../lib/social-api';
import { UNIVERSE_META } from '@yumia/shared';
import { API_BASE_URL } from '../lib/config';
import { universeLabel } from '../lib/universeMeta';
import { useI18n } from '../lib/useI18n';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import type { TranslationKey } from '../lib/translations';
import { FeatureTip } from '../components/FeatureTip';
import { GradientText, PressableScale, Reveal } from '../components/ui';
import { GLASS } from '../components/profile/ProfileChrome';
import { BrandButton } from '../components/social/SocialChrome';
import { ActionButton, BACK_ARROW, PillTabs, SelectChip, TopGlassButton } from '../components/p2b/ProfileVisuals';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BROADCAST_INTERVAL = 30_000;
const API = API_BASE_URL;

const INTENT_COLORS: Record<IntentType, string> = {
  dispo:   colors.brand,
  explore: colors.accent,
  event:   colors.success,
};

const INTENT_LABEL_KEYS: Record<IntentType, TranslationKey> = {
  dispo:   'nu_intent_dispo',
  explore: 'nu_intent_explore',
  event:   'nu_intent_event',
};
function intentLabel(t: (key: TranslationKey) => string, intent: IntentType): string {
  return t(INTENT_LABEL_KEYS[intent]);
}

const POPULAR_UNIVERSES = [
  'restaurant', 'bar', 'nightclub', 'cafe', 'museum', 'park',
  'beach', 'fitness', 'casino', 'hookah', 'live_music', 'karaoke',
  'cinema', 'escape_game', 'cannabis',
] as const;

const DURATION_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '4h', hours: 4 },
  { label: '8h', hours: 8 },
];

const SCHEDULE_OPTIONS: Array<{ labelKey: TranslationKey; hours: number }> = [
  { labelKey: 'nu_schedule_30min', hours: 0.5 },
  { labelKey: 'nu_schedule_1h',    hours: 1   },
  { labelKey: 'nu_schedule_2h',    hours: 2   },
  { labelKey: 'nu_schedule_4h',    hours: 4   },
  { labelKey: 'nu_schedule_tonight', hours: 8 },
  { labelKey: 'nu_schedule_tomorrow', hours: 24 },
];

type Tab = 'map' | 'people' | 'events';

const INTL_LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', ar: 'ar-SA' };

// ─── Avatar (initiale) ──────────────────────────────────────────────────────

/** Initiale dans un rond : liseré à la couleur de l'intention (elle porte un sens). */
function Avatar({ name, photoUrl: _photoUrl, size = 44, color }: { name: string; photoUrl?: string | null; size?: number; color?: string }) {
  const letter = name?.charAt(0).toUpperCase() ?? '?';
  const ring = color ?? colors.brand;
  return (
    <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2, borderColor: ring }]}>
      <Text style={[styles.avatarLetter, { fontSize: size * 0.42 }]}>{letter}</Text>
    </View>
  );
}

// ─── Intention ───────────────────────────────────────────────────────────────

function IntentBadge({ intent }: { intent: SocialIntent }) {
  const { t } = useI18n();
  const col = INTENT_COLORS[intent.intent];
  const label = intentLabel(t, intent.intent);
  const univMeta = intent.universe ? UNIVERSE_META[intent.universe as keyof typeof UNIVERSE_META] : null;
  return (
    <View style={[styles.intentBadge, GLASS]}>
      <View style={styles.intentBadgeRow}>
        <View style={[styles.intentDot, { backgroundColor: col }]} />
        <Text style={styles.intentBadgeText} numberOfLines={1}>
          {label}{univMeta && intent.universe ? `  ${univMeta.emoji} ${universeLabel(t, intent.universe)}` : ''}
        </Text>
      </View>
      {intent.note ? <Text style={styles.intentNote} numberOfLines={1}>{intent.note}</Text> : null}
    </View>
  );
}

// ─── Carte de personne ───────────────────────────────────────────────────────

function PersonCard({ item, onFollow, onPress }: { item: DiscoveredUser; onFollow: () => void; onPress: () => void }) {
  const { t } = useI18n();
  const u = item.user;
  const intentCol = item.intent ? INTENT_COLORS[item.intent.intent] : 'rgba(255,255,255,0.28)';
  return (
    <PressableScale style={[styles.personCard, GLASS]} onPress={onPress} scaleTo={0.98}>
      <Avatar name={u?.displayName ?? '?'} photoUrl={u?.photoUrl} size={52} color={intentCol} />
      <View style={styles.personInfo}>
        <View style={styles.personRow}>
          <Text style={styles.personName} numberOfLines={1}>{u?.displayName ?? t('nu_user_fallback')}</Text>
          <View style={styles.levelBadge}><Text style={styles.levelBadgeText}>{t('nu_level_prefix')}{u?.level ?? 1}</Text></View>
        </View>
        <Text style={styles.personDist}>📍 {t('nu_at_distance').replace('{km}', String(item.distanceKm))}</Text>
        {item.intent && <IntentBadge intent={item.intent} />}
        {!item.intent && u?.bio ? <Text style={styles.personBio} numberOfLines={1}>{u.bio}</Text> : null}
      </View>
      <ActionButton label={t('nu_follow')} onPress={onFollow} style={styles.followBtn} textStyle={styles.followBtnText} />
    </PressableScale>
  );
}

// ─── Carte de sortie ─────────────────────────────────────────────────────────

function EventCard({ event, myId, onJoin, onLeave, onPress }: {
  event: SocialEvent & { distanceKm?: number };
  myId: string;
  onJoin: () => void;
  onLeave: () => void;
  onPress: () => void;
}) {
  const { t, locale } = useI18n();
  const univMeta = event.universe ? UNIVERSE_META[event.universe as keyof typeof UNIVERSE_META] : null;
  const isJoined = event.participants.includes(myId);
  const isFull = event.participants.length >= event.maxPeople;
  const scheduled = new Date(event.scheduledAt);
  const intlLocale = INTL_LOCALE[locale] ?? 'fr-FR';
  const timeStr = scheduled.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' });
  const dateStr = scheduled.toLocaleDateString(intlLocale, { weekday: 'short', day: 'numeric', month: 'short' });
  const fill = event.maxPeople > 0 ? Math.min(1, event.participants.length / event.maxPeople) : 0;
  return (
    <PressableScale style={[styles.eventCard, GLASS]} onPress={onPress} scaleTo={0.99}>
      <View style={styles.eventHeader}>
        <View style={styles.eventEmojiBox}>
          <Text style={styles.eventEmoji}>{univMeta?.emoji ?? '🎉'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.eventMeta} numberOfLines={2}>
            {event.universe ? universeLabel(t, event.universe) : t('nu_event_fallback')} · {dateStr} {t('nu_event_at_time')} {timeStr}
          </Text>
        </View>
        {event.distanceKm !== undefined && (
          <View style={styles.eventDistPill}>
            <Text style={styles.eventDist}>{event.distanceKm} km</Text>
          </View>
        )}
      </View>
      {event.note ? <Text style={styles.eventNote} numberOfLines={2}>{event.note}</Text> : null}
      <View style={styles.gauge}>
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.gaugeFill, { width: `${Math.round(fill * 100)}%` }]}
        />
      </View>
      <View style={styles.eventFooter}>
        <Text style={styles.eventCreator} numberOfLines={1}>{t('nu_by_creator').replace('{name}', event.creatorName)}</Text>
        <Text style={styles.eventCount}>
          {event.participants.length}/{event.maxPeople} 👥
        </Text>
        {isJoined ? (
          <PressableScale style={[styles.leaveBtn, GLASS]} onPress={onLeave} scaleTo={0.95}>
            <Text style={styles.leaveBtnText}>{t('nu_leave')}</Text>
          </PressableScale>
        ) : isFull ? (
          <View style={[styles.leaveBtn, GLASS, { opacity: 0.6 }]}>
            <Text style={styles.fullBtnText}>{t('nu_full')}</Text>
          </View>
        ) : (
          <BrandButton compact label={t('nu_join')} onPress={onJoin} />
        )}
      </View>
    </PressableScale>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function NearbyUsersScreen() {
  const { t } = useI18n();
  const { accessToken, user } = useAuth();
  const { coords, resolving } = useLocation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('map');
  const [broadcasting, setBroadcasting] = useState(false);
  const [upsell, setUpsell] = useState<string | null>(null);
  // La carte sociale est une porte, pas un quota : en Gratuit, ni visibilité,
  // ni membres visibles, ni signal.
  const { isFeatureLocked, lockedMessage } = usePlanLimits();
  const socialMapLocked = isFeatureLocked('socialMap');
  const [myIntent, setMyIntent] = useState<SocialIntent | null>(null);
  const [nearby, setNearby] = useState<DiscoveredUser[]>([]);
  const [events, setEvents] = useState<(SocialEvent & { distanceKm?: number })[]>([]);
  const [loading, setLoading] = useState(false);

  // Intent sheet
  const [showIntentSheet, setShowIntentSheet] = useState(false);
  const [intentType, setIntentType] = useState<IntentType>('dispo');
  const [intentUniverse, setIntentUniverse] = useState<string | undefined>();
  const [intentNote, setIntentNote] = useState('');
  const [intentDuration, setIntentDuration] = useState(2);
  const [savingIntent, setSavingIntent] = useState(false);

  // Event creation sheet
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventUniverse, setEventUniverse] = useState<string | undefined>();
  const [eventNote, setEventNote] = useState('');
  const [eventInHours, setEventInHours] = useState(1);
  const [eventMaxPeople, setEventMaxPeople] = useState(10);
  const [savingEvent, setSavingEvent] = useState(false);

  const broadcastRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;

  const openSheet = useCallback(() => {
    setShowIntentSheet(true);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
      setShowIntentSheet(false),
    );
  }, [sheetAnim]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    if (!accessToken || resolving) return;
    setLoading(true);
    try {
      const [disc, evts, intent] = await Promise.all([
        // Les membres visibles ne sont même pas demandés en Gratuit : les
        // charger pour les masquer ensuite exposerait des positions à qui n'y
        // a pas droit, dans la réponse réseau.
        socialMapLocked
          ? Promise.resolve([] as Awaited<ReturnType<typeof socialApi.discoverNearby>>)
          : socialApi.discoverNearby(accessToken, coords.lat, coords.lng, 5),
        socialApi.getNearbyEvents(accessToken, coords.lat, coords.lng, 10),
        socialApi.getMyIntent(accessToken),
      ]);
      setNearby(disc);
      setEvents(evts);
      setMyIntent(intent ?? null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, coords, resolving, socialMapLocked]);

  const broadcast = useCallback(async () => {
    if (!accessToken || resolving) return;
    await fetch(`${API}/location/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ lat: coords.lat, lng: coords.lng, visibility: 'everyone' }),
    });
  }, [accessToken, coords, resolving]);

  const toggleBroadcast = useCallback(async () => {
    if (socialMapLocked) { setUpsell(lockedMessage()); return; }
    if (broadcasting) {
      if (broadcastRef.current) clearInterval(broadcastRef.current);
      broadcastRef.current = null;
      await fetch(`${API}/location/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
      setBroadcasting(false);
    } else {
      await broadcast();
      broadcastRef.current = setInterval(() => { void broadcast(); }, BROADCAST_INTERVAL);
      setBroadcasting(true);
      void fetchAll();
    }
  }, [broadcasting, broadcast, fetchAll, accessToken, socialMapLocked, lockedMessage]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);
  useEffect(() => () => { if (broadcastRef.current) clearInterval(broadcastRef.current); }, []);

  // ── Intent actions ─────────────────────────────────────────────────────────

  const submitIntent = useCallback(async () => {
    if (!accessToken) return;
    setSavingIntent(true);
    try {
      const result = await socialApi.setIntent(accessToken, {
        lat: coords.lat,
        lng: coords.lng,
        intent: intentType,
        universe: intentUniverse,
        note: intentNote.trim() || undefined,
        durationHours: intentDuration,
      });
      if (result) setMyIntent(result);
      closeSheet();
    } finally {
      setSavingIntent(false);
    }
  }, [accessToken, coords, intentType, intentUniverse, intentNote, intentDuration, closeSheet]);

  const cancelIntent = useCallback(async () => {
    if (!accessToken) return;
    await socialApi.clearIntent(accessToken);
    setMyIntent(null);
  }, [accessToken]);

  // ── Event actions ──────────────────────────────────────────────────────────

  const submitEvent = useCallback(async () => {
    if (!accessToken || !eventTitle.trim()) return;
    setSavingEvent(true);
    try {
      const scheduledAt = new Date(Date.now() + eventInHours * 3600_000).toISOString();
      const result = await socialApi.createEvent(accessToken, {
        lat: coords.lat,
        lng: coords.lng,
        universe: eventUniverse,
        title: eventTitle.trim(),
        note: eventNote.trim() || undefined,
        scheduledAt,
        maxPeople: eventMaxPeople,
      });
      if (result) setEvents((prev) => [result, ...prev]);
      setShowEventSheet(false);
      setEventTitle('');
      setEventNote('');
      setTab('events');
    } finally {
      setSavingEvent(false);
    }
  }, [accessToken, coords, eventTitle, eventUniverse, eventNote, eventInHours, eventMaxPeople]);

  const handleJoinEvent = useCallback(async (eventId: string) => {
    if (!accessToken) return;
    const result = await socialApi.joinEvent(accessToken, eventId);
    if (result) setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, ...result } : e)));
  }, [accessToken]);

  const handleLeaveEvent = useCallback(async (eventId: string) => {
    if (!accessToken) return;
    await socialApi.leaveEvent(accessToken, eventId);
    setEvents((prev) =>
      prev.map((e) => e.id === eventId
        ? { ...e, participants: e.participants.filter((id) => id !== user?.id) }
        : e,
      ),
    );
  }, [accessToken, user?.id]);

  const handleFollow = useCallback(async (userId: string) => {
    if (!accessToken) return;
    await socialApi.follow(accessToken, userId);
  }, [accessToken]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const intentExpiry = myIntent ? new Date(myIntent.expiresAt) : null;
  const intentMinutes = intentExpiry ? Math.max(0, Math.round((intentExpiry.getTime() - Date.now()) / 60_000)) : 0;

  // ── Loading state ──────────────────────────────────────────────────────────

  if (resolving) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.loadingText}>{t('map_locating')}</Text>
      </View>
    );
  }

  // ── Sheet translate ────────────────────────────────────────────────────────

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });

  const tabLabelKeys: Record<Tab, TranslationKey> = { map: 'nu_tab_map', people: 'nu_tab_people', events: 'nu_tab_events' };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />

      {/* ── En-tête ── */}
      <View style={styles.header}>
        <TopGlassButton label={BACK_ARROW} onPress={() => router.back()} size={42} />
        <GradientText style={styles.headerTitle}>{t('nu_header_title')}</GradientText>
        <PressableScale onPress={fetchAll} style={[styles.refreshBtn, GLASS]} scaleTo={0.88} hitSlop={6}>
          {loading ? <ActivityIndicator size="small" color={colors.brandSoft} /> : <Text style={styles.refreshText}>↻</Text>}
        </PressableScale>
      </View>

      {/* ── Onglets ── */}
      <View style={styles.tabsWrap}>
        <PillTabs
          tabs={(['map', 'people', 'events'] as Tab[]).map((tabKey) => ({
            key: tabKey,
            label: t(tabLabelKeys[tabKey]),
            badge: tabKey === 'people' ? nearby.length : tabKey === 'events' ? events.length : undefined,
          }))}
          active={tab}
          onChange={setTab}
        />
      </View>

      {/* ── Carte ── */}
      {tab === 'map' && (
        <View style={{ flex: 1 }}>
          <View style={styles.mapFrame}>
            <MapView
              style={styles.map}
              userInterfaceStyle="light"
              initialRegion={{
                latitude: coords.lat,
                longitude: coords.lng,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              {/* My marker */}
              <Marker coordinate={{ latitude: coords.lat, longitude: coords.lng }}>
                <View style={[styles.myMarker, myIntent && { borderColor: INTENT_COLORS[myIntent.intent] }]}>
                  <Text style={{ fontSize: 20 }}>😎</Text>
                </View>
              </Marker>

              <Circle
                center={{ latitude: coords.lat, longitude: coords.lng }}
                radius={5000}
                strokeColor={colors.brand + '55'}
                fillColor={colors.brand + '0D'}
              />

              {/* Other users */}
              {nearby.map((u) => {
                const col = u.intent ? INTENT_COLORS[u.intent.intent] : colors.textMuted;
                return (
                  <Marker key={u.userId} coordinate={{ latitude: u.lat, longitude: u.lng }}>
                    <View style={[styles.userMarker, { borderColor: col }]}>
                      <Text style={{ fontSize: 16 }}>
                        {u.intent ? (u.intent.intent === 'dispo' ? '🍹' : u.intent.intent === 'explore' ? '🗺️' : '🎉') : '👤'}
                      </Text>
                    </View>
                    <Callout onPress={() => router.push(`/user/${u.userId}` as never)}>
                      <View style={styles.callout}>
                        <Text style={styles.calloutName}>{u.user?.displayName ?? t('nu_user_fallback')}</Text>
                        <Text style={styles.calloutSub}>{t('nu_callout_level').replace('{lvl}', String(u.user?.level ?? 1)).replace('{km}', String(u.distanceKm))}</Text>
                        {u.intent && (
                          <Text style={[styles.calloutIntent, { color: col }]}>
                            {intentLabel(t, u.intent.intent)}
                            {u.intent.universe ? `  ${UNIVERSE_META[u.intent.universe as keyof typeof UNIVERSE_META]?.emoji ?? ''}` : ''}
                          </Text>
                        )}
                        {u.intent?.note && <Text style={styles.calloutNote}>"{u.intent.note}"</Text>}
                        <Text style={styles.calloutAction}>{t('nu_callout_action')}</Text>
                      </View>
                    </Callout>
                  </Marker>
                );
              })}
            </MapView>
          </View>

          {/* Panneau du bas vitré */}
          <View style={[styles.mapPanel, { paddingBottom: insets.bottom + 12 }]}>
            {/* Mon signal en cours */}
            {myIntent ? (
              <View style={[styles.myIntentBar, GLASS]}>
                <View style={[styles.intentDot, { backgroundColor: INTENT_COLORS[myIntent.intent] }]} />
                <Text style={styles.myIntentLabel} numberOfLines={1}>
                  {intentLabel(t, myIntent.intent)}
                  {myIntent.universe ? `  ${UNIVERSE_META[myIntent.universe as keyof typeof UNIVERSE_META]?.emoji ?? ''}` : ''}
                </Text>
                <Text style={styles.myIntentTime}>{t('nu_intent_remaining').replace('{min}', String(intentMinutes))}</Text>
                <Pressable onPress={cancelIntent} style={styles.cancelIntentBtn} hitSlop={6}>
                  <Text style={styles.cancelIntentText}>✕</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.mapActions}>
              <PressableScale
                style={[styles.broadcastBtn, GLASS, broadcasting && styles.broadcastBtnActive]}
                onPress={toggleBroadcast}
                scaleTo={0.95}
              >
                <View style={[styles.liveDot, broadcasting ? styles.liveDotOn : styles.liveDotOff]} />
                <Text style={styles.broadcastBtnText}>
                  {broadcasting ? t('nu_visible') : t('nu_invisible')}
                </Text>
              </PressableScale>

              {myIntent ? (
                <PressableScale
                  style={[styles.signalActive, GLASS, { borderColor: INTENT_COLORS[myIntent.intent] }]}
                  onPress={() => {
                    if (socialMapLocked) { setUpsell(lockedMessage()); return; }
                    if (myIntent) { void cancelIntent(); } else { openSheet(); }
                  }}
                  scaleTo={0.96}
                >
                  <Text style={styles.signalActiveText} numberOfLines={1}>
                    {`${intentLabel(t, myIntent.intent)}  ✕`}
                  </Text>
                </PressableScale>
              ) : (
                <BrandButton
                  label={t('nu_signal_btn')}
                  style={styles.signalBtn}
                  onPress={() => {
                    if (socialMapLocked) { setUpsell(lockedMessage()); return; }
                    if (myIntent) { void cancelIntent(); } else { openSheet(); }
                  }}
                />
              )}
            </View>

            <Text style={styles.mapHint}>
              {broadcasting
                ? t('nu_hint_visible').replace('{n}', String(nearby.length)).replace('{s2}', nearby.length !== 1 ? 's' : '').replace('{s}', nearby.length !== 1 ? 's' : '')
                : t('nu_hint_invisible')}
            </Text>
          </View>
        </View>
      )}

      {/* ── Personnes ── */}
      {tab === 'people' && (
        <View style={{ flex: 1 }}>
          {nearby.length === 0 ? (
            <Reveal style={styles.emptyState}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyMedal}>
                <Text style={styles.emptyEmoji}>👥</Text>
              </LinearGradient>
              <Text style={styles.emptyTitle}>{t('nu_empty_people_title')}</Text>
              <Text style={styles.emptySub}>
                {broadcasting
                  ? t('nu_empty_people_broadcasting')
                  : t('nu_empty_people_off')}
              </Text>
            </Reveal>
          ) : (
            <FlatList
              data={nearby}
              keyExtractor={(item) => item.userId}
              renderItem={({ item, index }) => {
                const card = (
                  <PersonCard
                    item={item}
                    onFollow={() => handleFollow(item.userId)}
                    onPress={() => router.push(`/user/${item.userId}` as never)}
                  />
                );
                return index < 8 ? <Reveal index={index} from="fade">{card}</Reveal> : card;
              }}
              contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: insets.bottom + 16 }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      )}

      {/* ── Sorties ── */}
      {tab === 'events' && (
        <View style={{ flex: 1 }}>
          {events.length === 0 ? (
            <Reveal style={styles.emptyState}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyMedal}>
                <Text style={styles.emptyEmoji}>🎉</Text>
              </LinearGradient>
              <Text style={styles.emptyTitle}>{t('nu_empty_events_title')}</Text>
              <Text style={styles.emptySub}>{t('nu_empty_events_sub')}</Text>
            </Reveal>
          ) : (
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => {
                const card = (
                  <EventCard
                    event={item}
                    myId={user?.id ?? ''}
                    onJoin={() => handleJoinEvent(item.id)}
                    onLeave={() => handleLeaveEvent(item.id)}
                    onPress={() => {}}
                  />
                );
                return index < 8 ? <Reveal index={index} from="fade">{card}</Reveal> : card;
              }}
              contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: insets.bottom + 96 }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}

          {/* Créer une sortie */}
          <BrandButton
            label={t('nu_fab_create_event')}
            onPress={() => setShowEventSheet(true)}
            style={[styles.fab, { bottom: insets.bottom + 20 }]}
          />
        </View>
      )}

      {/* ── Feuille : signal ── */}
      {showIntentSheet && (
        <Modal transparent animationType="none" onRequestClose={closeSheet}>
          <TouchableWithoutFeedback onPress={closeSheet}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.sheetHandle} />
              <GradientText style={styles.sheetTitle}>{t('nu_sheet_title')}</GradientText>
              <Text style={styles.sheetSub}>{t('nu_sheet_sub')}</Text>

              {/* Intention */}
              <Text style={styles.sheetLabel}>{t('nu_sheet_i_am')}</Text>
              <View style={styles.intentTypeRow}>
                {(['dispo', 'explore', 'event'] as IntentType[]).map((type) => (
                  <SelectChip key={type} fill label={intentLabel(t, type)} active={intentType === type} onPress={() => setIntentType(type)} />
                ))}
              </View>

              {/* Univers */}
              <Text style={styles.sheetLabel}>{t('nu_sheet_universe_optional')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.univScroll} contentContainerStyle={styles.chipRow}>
                {POPULAR_UNIVERSES.map((u) => {
                  const meta = UNIVERSE_META[u];
                  const isSelected = intentUniverse === u;
                  return (
                    <SelectChip
                      key={u}
                      label={`${meta.emoji}  ${universeLabel(t, u)}`}
                      active={isSelected}
                      onPress={() => setIntentUniverse(isSelected ? undefined : u)}
                    />
                  );
                })}
              </ScrollView>

              {/* Message */}
              <Text style={styles.sheetLabel}>{t('nu_sheet_message_optional')}</Text>
              <TextInput
                style={[styles.noteInput, GLASS]}
                placeholder={t('nu_sheet_note_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={intentNote}
                onChangeText={(v) => setIntentNote(v.slice(0, 100))}
                maxLength={100}
                multiline
              />
              <Text style={styles.noteCounter}>{intentNote.length}/100</Text>

              {/* Durée */}
              <Text style={styles.sheetLabel}>{t('nu_sheet_duration')}</Text>
              <View style={styles.durationRow}>
                {DURATION_OPTIONS.map((d) => (
                  <SelectChip key={d.hours} fill label={d.label} active={intentDuration === d.hours} onPress={() => setIntentDuration(d.hours)} />
                ))}
              </View>

              <BrandButton
                label={t('nu_sheet_activate')}
                onPress={submitIntent}
                loading={savingIntent}
                disabled={savingIntent}
                style={styles.submitBtn}
              />
            </KeyboardAvoidingView>
          </Animated.View>
        </Modal>
      )}

      {/* ── Feuille : créer une sortie ── */}
      {showEventSheet && (
        <Modal transparent animationType="slide" onRequestClose={() => setShowEventSheet(false)}>
          <TouchableWithoutFeedback onPress={() => setShowEventSheet(false)}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>
          <View style={[styles.sheet, styles.sheetTall]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.sheetHandle} />
              <GradientText style={styles.sheetTitle}>{t('nu_event_sheet_title')}</GradientText>

              <Text style={styles.sheetLabel}>{t('nu_event_title_label')}</Text>
              <TextInput
                style={[styles.noteInput, GLASS]}
                placeholder={t('nu_event_title_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={eventTitle}
                onChangeText={(v) => setEventTitle(v.slice(0, 80))}
                maxLength={80}
              />

              <Text style={styles.sheetLabel}>{t('nu_sheet_universe_optional')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.univScroll} contentContainerStyle={styles.chipRow}>
                {POPULAR_UNIVERSES.map((u) => {
                  const meta = UNIVERSE_META[u];
                  const isSelected = eventUniverse === u;
                  return (
                    <SelectChip
                      key={u}
                      label={`${meta.emoji}  ${universeLabel(t, u)}`}
                      active={isSelected}
                      onPress={() => setEventUniverse(isSelected ? undefined : u)}
                    />
                  );
                })}
              </ScrollView>

              <Text style={styles.sheetLabel}>{t('nu_event_desc_label')}</Text>
              <TextInput
                style={[styles.noteInput, GLASS]}
                placeholder={t('nu_event_desc_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={eventNote}
                onChangeText={(v) => setEventNote(v.slice(0, 200))}
                maxLength={200}
                multiline
              />

              <Text style={styles.sheetLabel}>{t('nu_event_when')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }} contentContainerStyle={styles.chipRow}>
                {SCHEDULE_OPTIONS.map((opt) => (
                  <SelectChip
                    key={opt.hours}
                    label={t(opt.labelKey)}
                    active={eventInHours === opt.hours}
                    onPress={() => setEventInHours(opt.hours)}
                  />
                ))}
              </ScrollView>

              <Text style={styles.sheetLabel}>{t('nu_event_max_people').replace('{n}', String(eventMaxPeople))}</Text>
              <View style={styles.durationRow}>
                {[5, 10, 20, 50].map((n) => (
                  <SelectChip key={n} fill label={String(n)} active={eventMaxPeople === n} onPress={() => setEventMaxPeople(n)} />
                ))}
              </View>

              <BrandButton
                label={t('nu_event_publish')}
                onPress={submitEvent}
                loading={savingEvent}
                disabled={!eventTitle.trim() || savingEvent}
                style={styles.submitBtn}
              />
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}
      <FeatureTip feature="social_map" />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.bg },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  loadingText:   { color: colors.textMuted, fontSize: 15 },
  flex1:         { flex: 1 },

  // En-tête
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.sm,
  },
  headerTitle: { flex: 1, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  refreshBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: '#fff', fontSize: 20, fontWeight: '800' },

  // Onglets
  tabsWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },

  // Carte
  mapFrame: {
    flex: 1, marginHorizontal: spacing.md, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  map: { flex: 1 },
  myMarker: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.bg, borderWidth: 2.5, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  userMarker: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surfaceElevated, borderWidth: 2, borderColor: colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  callout:       { padding: 10, minWidth: 180, maxWidth: 220 },
  calloutName:   { fontWeight: '800', fontSize: 14, marginBottom: 2, color: '#111' },
  calloutSub:    { fontSize: 12, color: '#666', marginBottom: 4 },
  calloutIntent: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  calloutNote:   { fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 4 },
  calloutAction: { fontSize: 13, color: colors.brand, fontWeight: '800' },

  // Panneau du bas
  mapPanel: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: 10 },
  myIntentBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8,
  },
  intentDot: { width: 10, height: 10, borderRadius: 5 },
  myIntentLabel: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  myIntentTime:  { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  cancelIntentBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.danger + '22', alignItems: 'center', justifyContent: 'center' },
  cancelIntentText:{ color: colors.danger, fontWeight: '800', fontSize: 14 },
  mapActions:    { flexDirection: 'row', gap: 10, alignItems: 'center' },
  broadcastBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    height: 52, paddingHorizontal: 16, borderRadius: radius.pill,
  },
  broadcastBtnActive: { borderColor: colors.success },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  liveDotOn: { backgroundColor: colors.success, shadowColor: colors.success, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  liveDotOff: { backgroundColor: 'rgba(255,255,255,0.28)' },
  broadcastBtnText: { color: colors.textPrimary, fontWeight: '800', fontSize: 13 },
  signalBtn: { flex: 1 },
  signalActive: {
    flex: 1, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, paddingHorizontal: spacing.md,
  },
  signalActiveText: { color: colors.textPrimary, fontWeight: '900', fontSize: 14 },
  mapHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 17 },

  // Personnes
  personCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: spacing.md, borderRadius: radius.lg,
  },
  personInfo:  { flex: 1, gap: 4, minWidth: 0 },
  personRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personName:  { flexShrink: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  personDist:  { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  personBio:   { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
  levelBadge:  {
    borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.brand + '88', backgroundColor: colors.brand + '18',
  },
  levelBadgeText: { color: colors.brandSoft, fontSize: 11, fontWeight: '800' },
  followBtn:   { height: 36, paddingHorizontal: 14, alignSelf: 'flex-start' },
  followBtnText: { fontSize: 13 },

  // Intention
  intentBadge:     { borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, marginTop: 2, alignSelf: 'flex-start', maxWidth: '100%' },
  intentBadgeRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  intentBadgeText: { fontSize: 12, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
  intentNote:      { fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginTop: 3 },

  // Sorties
  eventCard: { borderRadius: radius.lg, padding: spacing.md, gap: 10 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventEmojiBox: {
    width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  eventEmoji:  { fontSize: 26 },
  eventTitle:  { color: colors.textPrimary, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  eventMeta:   { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  eventDistPill: {
    borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  eventDist:   { fontSize: 11, color: colors.textSecondary, fontWeight: '800' },
  eventNote:   { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  gauge: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  gaugeFill: { height: 4, borderRadius: 2 },
  eventFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventCreator:{ fontSize: 12, color: colors.textMuted, flex: 1 },
  eventCount:  { fontSize: 12, color: colors.textPrimary, fontWeight: '800' },
  leaveBtn: { height: 38, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  leaveBtnText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  fullBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },

  // Avatar
  avatarCircle:  { alignItems: 'center', justifyContent: 'center', borderWidth: 2, backgroundColor: colors.surfaceElevated },
  avatarLetter:  { fontWeight: '900', color: '#fff' },

  // États vides
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: spacing.lg },
  emptyMedal: {
    width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs, ...elevation.glowBrand,
  },
  emptyEmoji:  { fontSize: 38 },
  emptyTitle:  { color: colors.textPrimary, fontSize: 20, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3 },
  emptySub:    { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  separator:   { height: 10 },

  // Bouton flottant
  fab: { position: 'absolute', left: spacing.md, right: spacing.md },

  // Feuilles du bas
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.md, paddingBottom: 32, gap: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
    ...elevation.high,
  },
  sheetTall: { maxHeight: SCREEN_HEIGHT * 0.92 },
  sheetHandle: {
    width: 44, height: 5, borderRadius: 3, backgroundColor: colors.brand,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle:  { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  sheetSub:    { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  sheetLabel:  {
    fontSize: 11, color: colors.textMuted, fontWeight: '800', marginTop: 16, marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: 1.8,
  },

  intentTypeRow: { flexDirection: 'row', gap: 8 },
  univScroll: { marginBottom: 4 },
  chipRow: { gap: 8, paddingEnd: spacing.sm },

  noteInput: {
    borderRadius: radius.md, padding: 12,
    color: colors.textPrimary, fontSize: 14, minHeight: 52,
    textAlignVertical: 'top',
  },
  noteCounter: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4 },

  durationRow:    { flexDirection: 'row', gap: 8, marginBottom: 6 },

  submitBtn: { marginTop: 20 },
});
