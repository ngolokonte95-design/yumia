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
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { socialApi, type DiscoveredUser, type IntentType, type SocialEvent, type SocialIntent } from '../lib/social-api';
import { UNIVERSE_META } from '@yumia/shared';
import { API_BASE_URL } from '../lib/config';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BROADCAST_INTERVAL = 30_000;
const API = API_BASE_URL;

const INTENT_COLORS: Record<IntentType, string> = {
  dispo:   colors.brand,
  explore: colors.accent,
  event:   colors.success,
};

const INTENT_LABELS: Record<IntentType, string> = {
  dispo:   '🍹 Dispo',
  explore: '🗺️ Explorer',
  event:   '🎉 Événement',
};

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

const SCHEDULE_OPTIONS = [
  { label: 'Dans 30min', hours: 0.5 },
  { label: 'Dans 1h',    hours: 1   },
  { label: 'Dans 2h',    hours: 2   },
  { label: 'Dans 4h',    hours: 4   },
  { label: 'Ce soir',    hours: 8   },
  { label: 'Demain',     hours: 24  },
];

type Tab = 'map' | 'people' | 'events';

// ─── Avatar letters ─────────────────────────────────────────────────────────

function Avatar({ name, photoUrl, size = 44, color }: { name: string; photoUrl?: string | null; size?: number; color?: string }) {
  const letter = name?.charAt(0).toUpperCase() ?? '?';
  const bg = color ?? colors.brand;
  return (
    <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg + '33', borderColor: bg }]}>
      <Text style={[styles.avatarLetter, { fontSize: size * 0.42, color: bg }]}>{letter}</Text>
    </View>
  );
}

// ─── Intent badge ────────────────────────────────────────────────────────────

function IntentBadge({ intent }: { intent: SocialIntent }) {
  const col = INTENT_COLORS[intent.intent];
  const label = INTENT_LABELS[intent.intent];
  const univMeta = intent.universe ? UNIVERSE_META[intent.universe as keyof typeof UNIVERSE_META] : null;
  return (
    <View style={[styles.intentBadge, { borderColor: col + '55', backgroundColor: col + '18' }]}>
      <Text style={[styles.intentBadgeText, { color: col }]}>
        {label}{univMeta ? `  ${univMeta.emoji} ${univMeta.labelFr}` : ''}
      </Text>
      {intent.note ? <Text style={styles.intentNote} numberOfLines={1}>{intent.note}</Text> : null}
    </View>
  );
}

// ─── People list card ────────────────────────────────────────────────────────

function PersonCard({ item, onFollow, onPress }: { item: DiscoveredUser; onFollow: () => void; onPress: () => void }) {
  const u = item.user;
  const intentCol = item.intent ? INTENT_COLORS[item.intent.intent] : colors.textMuted;
  return (
    <Pressable style={styles.personCard} onPress={onPress}>
      <Avatar name={u?.displayName ?? '?'} photoUrl={u?.photoUrl} size={48} color={intentCol} />
      <View style={styles.personInfo}>
        <View style={styles.personRow}>
          <Text style={styles.personName} numberOfLines={1}>{u?.displayName ?? 'Utilisateur'}</Text>
          <View style={styles.levelBadge}><Text style={styles.levelBadgeText}>Niv.{u?.level ?? 1}</Text></View>
        </View>
        <Text style={styles.personDist}>À {item.distanceKm} km</Text>
        {item.intent && <IntentBadge intent={item.intent} />}
        {!item.intent && u?.bio ? <Text style={styles.personBio} numberOfLines={1}>{u.bio}</Text> : null}
      </View>
      <Pressable style={styles.followBtn} onPress={onFollow}>
        <Text style={styles.followBtnText}>Suivre</Text>
      </Pressable>
    </Pressable>
  );
}

// ─── Event card ──────────────────────────────────────────────────────────────

function EventCard({ event, myId, onJoin, onLeave, onPress }: {
  event: SocialEvent & { distanceKm?: number };
  myId: string;
  onJoin: () => void;
  onLeave: () => void;
  onPress: () => void;
}) {
  const univMeta = event.universe ? UNIVERSE_META[event.universe as keyof typeof UNIVERSE_META] : null;
  const isJoined = event.participants.includes(myId);
  const isFull = event.participants.length >= event.maxPeople;
  const scheduled = new Date(event.scheduledAt);
  const timeStr = scheduled.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = scheduled.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <Pressable style={styles.eventCard} onPress={onPress}>
      <View style={styles.eventHeader}>
        <Text style={styles.eventEmoji}>{univMeta?.emoji ?? '🎉'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.eventMeta}>
            {univMeta?.labelFr ?? 'Événement'} · {dateStr} à {timeStr}
          </Text>
        </View>
        {event.distanceKm !== undefined && (
          <Text style={styles.eventDist}>{event.distanceKm} km</Text>
        )}
      </View>
      {event.note ? <Text style={styles.eventNote} numberOfLines={2}>{event.note}</Text> : null}
      <View style={styles.eventFooter}>
        <Text style={styles.eventCreator}>Par {event.creatorName}</Text>
        <Text style={styles.eventCount}>
          {event.participants.length}/{event.maxPeople} 👥
        </Text>
        <Pressable
          style={[styles.joinBtn, isJoined && styles.joinBtnActive, isFull && !isJoined && styles.joinBtnFull]}
          onPress={isJoined ? onLeave : onJoin}
          disabled={isFull && !isJoined}
        >
          <Text style={styles.joinBtnText}>{isJoined ? 'Quitter' : isFull ? 'Complet' : 'Rejoindre'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function NearbyUsersScreen() {
  const { accessToken, user } = useAuth();
  const { coords, resolving } = useLocation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('map');
  const [broadcasting, setBroadcasting] = useState(false);
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
        socialApi.discoverNearby(accessToken, coords.lat, coords.lng, 5),
        socialApi.getNearbyEvents(accessToken, coords.lat, coords.lng, 10),
        socialApi.getMyIntent(accessToken),
      ]);
      setNearby(disc);
      setEvents(evts);
      setMyIntent(intent ?? null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, coords, resolving]);

  const broadcast = useCallback(async () => {
    if (!accessToken || resolving) return;
    await fetch(`${API}/location/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ lat: coords.lat, lng: coords.lng, visibility: 'everyone' }),
    });
  }, [accessToken, coords, resolving]);

  const toggleBroadcast = useCallback(async () => {
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
  }, [broadcasting, broadcast, fetchAll, accessToken]);

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
        <Text style={styles.loadingText}>Localisation en cours…</Text>
      </View>
    );
  }

  // ── Sheet translate ────────────────────────────────────────────────────────

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Mode Social</Text>
        <Pressable onPress={fetchAll} style={styles.headerBtn}>
          {loading ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={styles.headerBtnText}>↻</Text>}
        </Pressable>
      </View>

      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        {(['map', 'people', 'events'] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = { map: '🗺️  Carte', people: '👥  Personnes', events: '🎉  Événements' };
          return (
            <Pressable key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>{labels[t]}</Text>
              {t === 'people' && nearby.length > 0 && <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{nearby.length}</Text></View>}
              {t === 'events' && events.length > 0 && <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{events.length}</Text></View>}
            </Pressable>
          );
        })}
      </View>

      {/* ── Map tab ── */}
      {tab === 'map' && (
        <View style={{ flex: 1 }}>
          <MapView
            style={styles.map}
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
              strokeColor={colors.brand + '33'}
              fillColor={colors.brand + '09'}
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
                      <Text style={styles.calloutName}>{u.user?.displayName ?? 'Utilisateur'}</Text>
                      <Text style={styles.calloutSub}>Niveau {u.user?.level ?? 1} · {u.distanceKm} km</Text>
                      {u.intent && (
                        <Text style={[styles.calloutIntent, { color: col }]}>
                          {INTENT_LABELS[u.intent.intent]}
                          {u.intent.universe ? `  ${UNIVERSE_META[u.intent.universe as keyof typeof UNIVERSE_META]?.emoji ?? ''}` : ''}
                        </Text>
                      )}
                      {u.intent?.note && <Text style={styles.calloutNote}>"{u.intent.note}"</Text>}
                      <Text style={styles.calloutAction}>Voir le profil →</Text>
                    </View>
                  </Callout>
                </Marker>
              );
            })}
          </MapView>

          {/* Map bottom panel */}
          <View style={[styles.mapPanel, { paddingBottom: insets.bottom + 12 }]}>
            {/* My intent status */}
            {myIntent ? (
              <View style={[styles.myIntentBar, { borderColor: INTENT_COLORS[myIntent.intent] + '55' }]}>
                <Text style={[styles.myIntentLabel, { color: INTENT_COLORS[myIntent.intent] }]}>
                  {INTENT_LABELS[myIntent.intent]}
                  {myIntent.universe ? `  ${UNIVERSE_META[myIntent.universe as keyof typeof UNIVERSE_META]?.emoji ?? ''}` : ''}
                </Text>
                <Text style={styles.myIntentTime}>encore {intentMinutes}min</Text>
                <Pressable onPress={cancelIntent} style={styles.cancelIntentBtn}>
                  <Text style={styles.cancelIntentText}>✕</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.mapActions}>
              <Pressable
                style={[styles.broadcastBtn, broadcasting && styles.broadcastBtnActive]}
                onPress={toggleBroadcast}
              >
                <Text style={styles.broadcastIcon}>{broadcasting ? '🟢' : '⚫'}</Text>
                <Text style={styles.broadcastBtnText}>
                  {broadcasting ? 'Visible' : 'Invisible'}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.signalBtn, myIntent && { backgroundColor: INTENT_COLORS[myIntent.intent] }]}
                onPress={myIntent ? cancelIntent : openSheet}
              >
                <Text style={styles.signalBtnText}>
                  {myIntent ? `${INTENT_LABELS[myIntent.intent]}  ✕` : '✨  Signal'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.mapHint}>
              {broadcasting
                ? `${nearby.length} personne${nearby.length !== 1 ? 's' : ''} visible${nearby.length !== 1 ? 's' : ''} dans un rayon de 5 km`
                : 'Active ta position pour être visible et rencontrer des gens'}
            </Text>
          </View>
        </View>
      )}

      {/* ── People tab ── */}
      {tab === 'people' && (
        <View style={{ flex: 1 }}>
          {nearby.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>👥</Text>
              <Text style={styles.emptyTitle}>Personne à proximité</Text>
              <Text style={styles.emptySub}>
                {broadcasting
                  ? 'Les utilisateurs qui activent leur position apparaîtront ici.'
                  : 'Active ta position sur la carte pour découvrir les gens autour de toi.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={nearby}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <PersonCard
                  item={item}
                  onFollow={() => handleFollow(item.userId)}
                  onPress={() => router.push(`/user/${item.userId}` as never)}
                />
              )}
              contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: insets.bottom + 16 }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      )}

      {/* ── Events tab ── */}
      {tab === 'events' && (
        <View style={{ flex: 1 }}>
          {events.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={styles.emptyTitle}>Aucun événement proche</Text>
              <Text style={styles.emptySub}>Crée le premier événement spontané de ta zone !</Text>
            </View>
          ) : (
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <EventCard
                  event={item}
                  myId={user?.id ?? ''}
                  onJoin={() => handleJoinEvent(item.id)}
                  onLeave={() => handleLeaveEvent(item.id)}
                  onPress={() => {}}
                />
              )}
              contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: insets.bottom + 80 }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}

          {/* FAB create event */}
          <Pressable
            style={[styles.fab, { bottom: insets.bottom + 20 }]}
            onPress={() => setShowEventSheet(true)}
          >
            <Text style={styles.fabText}>+ Créer un événement</Text>
          </Pressable>
        </View>
      )}

      {/* ── Intent bottom sheet ── */}
      {showIntentSheet && (
        <Modal transparent animationType="none" onRequestClose={closeSheet}>
          <TouchableWithoutFeedback onPress={closeSheet}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Envoie un signal 📡</Text>
              <Text style={styles.sheetSub}>Indique aux autres ce que tu cherches maintenant</Text>

              {/* Intent type */}
              <Text style={styles.sheetLabel}>Je suis…</Text>
              <View style={styles.intentTypeRow}>
                {(['dispo', 'explore', 'event'] as IntentType[]).map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.intentTypeBtn, intentType === type && { backgroundColor: INTENT_COLORS[type] + '22', borderColor: INTENT_COLORS[type] }]}
                    onPress={() => setIntentType(type)}
                  >
                    <Text style={[styles.intentTypeBtnText, intentType === type && { color: INTENT_COLORS[type], fontWeight: '700' }]}>
                      {INTENT_LABELS[type]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Universe picker */}
              <Text style={styles.sheetLabel}>Univers (optionnel)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.univScroll}>
                {POPULAR_UNIVERSES.map((u) => {
                  const meta = UNIVERSE_META[u];
                  const isSelected = intentUniverse === u;
                  return (
                    <Pressable
                      key={u}
                      style={[styles.univChip, isSelected && styles.univChipSelected]}
                      onPress={() => setIntentUniverse(isSelected ? undefined : u)}
                    >
                      <Text style={styles.univChipText}>{meta.emoji}  {meta.labelFr}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Note */}
              <Text style={styles.sheetLabel}>Message (optionnel)</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="Ex: Cherche quelqu'un pour un verre ce soir…"
                placeholderTextColor={colors.textMuted}
                value={intentNote}
                onChangeText={(t) => setIntentNote(t.slice(0, 100))}
                maxLength={100}
                multiline
              />
              <Text style={styles.noteCounter}>{intentNote.length}/100</Text>

              {/* Duration */}
              <Text style={styles.sheetLabel}>Durée du signal</Text>
              <View style={styles.durationRow}>
                {DURATION_OPTIONS.map((d) => (
                  <Pressable
                    key={d.hours}
                    style={[styles.durationBtn, intentDuration === d.hours && styles.durationBtnActive]}
                    onPress={() => setIntentDuration(d.hours)}
                  >
                    <Text style={[styles.durationBtnText, intentDuration === d.hours && { color: colors.brand, fontWeight: '700' }]}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={[styles.submitBtn, savingIntent && { opacity: 0.6 }]} onPress={submitIntent} disabled={savingIntent}>
                {savingIntent
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>✨  Activer mon signal</Text>
                }
              </Pressable>
            </KeyboardAvoidingView>
          </Animated.View>
        </Modal>
      )}

      {/* ── Create event bottom sheet ── */}
      {showEventSheet && (
        <Modal transparent animationType="slide" onRequestClose={() => setShowEventSheet(false)}>
          <TouchableWithoutFeedback onPress={() => setShowEventSheet(false)}>
            <View style={styles.backdrop} />
          </TouchableWithoutFeedback>
          <View style={[styles.sheet, styles.sheetTall]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Créer un événement 🎉</Text>

              <Text style={styles.sheetLabel}>Titre *</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="Ex: Afterwork au rooftop, blind test…"
                placeholderTextColor={colors.textMuted}
                value={eventTitle}
                onChangeText={(t) => setEventTitle(t.slice(0, 80))}
                maxLength={80}
              />

              <Text style={styles.sheetLabel}>Univers (optionnel)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.univScroll}>
                {POPULAR_UNIVERSES.map((u) => {
                  const meta = UNIVERSE_META[u];
                  const isSelected = eventUniverse === u;
                  return (
                    <Pressable
                      key={u}
                      style={[styles.univChip, isSelected && styles.univChipSelected]}
                      onPress={() => setEventUniverse(isSelected ? undefined : u)}
                    >
                      <Text style={styles.univChipText}>{meta.emoji}  {meta.labelFr}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.sheetLabel}>Description (optionnel)</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="Quelques détails…"
                placeholderTextColor={colors.textMuted}
                value={eventNote}
                onChangeText={(t) => setEventNote(t.slice(0, 200))}
                maxLength={200}
                multiline
              />

              <Text style={styles.sheetLabel}>Quand ?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                {SCHEDULE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.hours}
                    style={[styles.durationBtn, eventInHours === opt.hours && styles.durationBtnActive, { marginRight: 8 }]}
                    onPress={() => setEventInHours(opt.hours)}
                  >
                    <Text style={[styles.durationBtnText, eventInHours === opt.hours && { color: colors.brand, fontWeight: '700' }]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.sheetLabel}>Nombre max de participants : {eventMaxPeople}</Text>
              <View style={styles.durationRow}>
                {[5, 10, 20, 50].map((n) => (
                  <Pressable
                    key={n}
                    style={[styles.durationBtn, eventMaxPeople === n && styles.durationBtnActive]}
                    onPress={() => setEventMaxPeople(n)}
                  >
                    <Text style={[styles.durationBtnText, eventMaxPeople === n && { color: colors.brand, fontWeight: '700' }]}>{n}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.submitBtn, (!eventTitle.trim() || savingEvent) && { opacity: 0.5 }]}
                onPress={submitEvent}
                disabled={!eventTitle.trim() || savingEvent}
              >
                {savingEvent
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>🎉  Publier l'événement</Text>
                }
              </Pressable>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.background },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:   { color: colors.textMuted, fontSize: 15 },

  // Header
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 10 },
  headerTitle:   { ...typography.h3, color: colors.text },
  headerBtn:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerBtnText: { fontSize: 22, color: colors.brand },

  // Tab bar
  tabBar:          { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn:          { flex: 1, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  tabBtnActive:    { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabBtnText:      { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  tabBtnTextActive:{ color: colors.brand },
  tabBadge:        { backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText:    { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Map
  map: { flex: 1 },
  myMarker: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.brand + '33', borderWidth: 2, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  userMarker: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.textMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  callout:       { padding: 10, minWidth: 180, maxWidth: 220 },
  calloutName:   { fontWeight: '700', fontSize: 14, marginBottom: 2, color: '#111' },
  calloutSub:    { fontSize: 12, color: '#666', marginBottom: 4 },
  calloutIntent: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  calloutNote:   { fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 4 },
  calloutAction: { fontSize: 13, color: colors.brand, fontWeight: '700' },

  // Map panel
  mapPanel: {
    backgroundColor: colors.surface, padding: spacing.md,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: 1, borderTopColor: colors.border, gap: 10,
  },
  myIntentBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.background,
  },
  myIntentLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
  myIntentTime:  { fontSize: 12, color: colors.textMuted },
  cancelIntentBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.danger + '22', alignItems: 'center', justifyContent: 'center' },
  cancelIntentText:{ color: colors.danger, fontWeight: '700', fontSize: 14 },
  mapActions:    { flexDirection: 'row', gap: 10 },
  broadcastBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  broadcastBtnActive: { borderColor: colors.success },
  broadcastIcon: { fontSize: 14 },
  broadcastBtnText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  signalBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.brand,
  },
  signalBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  mapHint:       { fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  // People tab
  personCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
  },
  personInfo:  { flex: 1, gap: 3 },
  personRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personName:  { ...typography.body, color: colors.text, flex: 1 },
  personDist:  { fontSize: 12, color: colors.textMuted },
  personBio:   { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  levelBadge:  { backgroundColor: colors.brand + '22', borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  levelBadgeText: { color: colors.brand, fontSize: 11, fontWeight: '700' },
  followBtn:   {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.lg,
    backgroundColor: colors.brand + '22', borderWidth: 1, borderColor: colors.brand,
    alignSelf: 'flex-start',
  },
  followBtnText: { color: colors.brand, fontSize: 13, fontWeight: '700' },

  // Intent badge
  intentBadge:     { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, marginTop: 2, alignSelf: 'flex-start' },
  intentBadgeText: { fontSize: 11, fontWeight: '700' },
  intentNote:      { fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 },

  // Events tab
  eventCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.sm, gap: 8,
  },
  eventHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eventEmoji:  { fontSize: 28, lineHeight: 34 },
  eventTitle:  { ...typography.body, color: colors.text, fontWeight: '700' },
  eventMeta:   { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  eventDist:   { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  eventNote:   { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  eventFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventCreator:{ fontSize: 12, color: colors.textMuted, flex: 1 },
  eventCount:  { fontSize: 12, color: colors.text, fontWeight: '600' },
  joinBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.lg,
    backgroundColor: colors.brand, alignSelf: 'flex-start',
  },
  joinBtnActive: { backgroundColor: colors.danger },
  joinBtnFull:   { backgroundColor: colors.border },
  joinBtnText:   { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Avatar
  avatarCircle:  { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarLetter:  { fontWeight: '800' },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: spacing.lg },
  emptyEmoji:  { fontSize: 52 },
  emptyTitle:  { ...typography.heading, color: colors.text, textAlign: 'center' },
  emptySub:    { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  separator:   { height: 8 },

  // FAB
  fab: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    backgroundColor: colors.brand, borderRadius: radius.lg, padding: 16,
    alignItems: 'center', shadowColor: colors.brand, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Bottom sheets
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.md, paddingBottom: 32, gap: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  sheetTall: { maxHeight: SCREEN_HEIGHT * 0.92 },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle:  { ...typography.title, color: colors.text, marginBottom: 4 },
  sheetSub:    { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  sheetLabel:  { fontSize: 12, color: colors.textMuted, fontWeight: '700', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },

  intentTypeRow: { flexDirection: 'row', gap: 8 },
  intentTypeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', backgroundColor: colors.background,
  },
  intentTypeBtnText: { fontSize: 12, color: colors.textMuted },

  univScroll: { marginBottom: 4 },
  univChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
    marginRight: 8,
  },
  univChipSelected: { borderColor: colors.brand, backgroundColor: colors.brand + '18' },
  univChipText: { fontSize: 13, color: colors.text, whiteSpace: 'nowrap' } as never,

  noteInput: {
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 12,
    color: colors.text, fontSize: 14, minHeight: 52,
    textAlignVertical: 'top',
  },
  noteCounter: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 2 },

  durationRow:    { flexDirection: 'row', gap: 8, marginBottom: 6 },
  durationBtn:    {
    flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', backgroundColor: colors.background,
  },
  durationBtnActive: { borderColor: colors.brand, backgroundColor: colors.brand + '18' },
  durationBtnText:   { fontSize: 13, color: colors.textMuted },

  submitBtn:     {
    marginTop: 20, backgroundColor: colors.brand, borderRadius: radius.lg,
    padding: 16, alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
