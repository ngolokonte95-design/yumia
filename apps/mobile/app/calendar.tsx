import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, I18nManager, PanResponder, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientText, PressableScale, Reveal } from '../components/ui';
import { MonthGrid } from '../components/calendar/MonthGrid';
import { EventEditor } from '../components/calendar/EventEditor';
import {
  BrandFab, BrandPill, CrystalTitle, GLASS, GlassChipButton, PlannerEmpty,
} from '../components/calendar/PlannerChrome';
import { GlassCircleButton } from '../components/profile/ProfileChrome';
import { SpaceBackdrop, SPACE_BLACK } from '../components/auth/AuthChrome';
import { useAuth } from '../lib/auth-context';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import {
  calendarApi, CATEGORY_META,
  type CalendarEvent, type EventCategory, type EventDraft,
} from '../lib/calendar-api';
import {
  addMonths, dayKey, formatEventTime, formatLongDate, isForeignTimezone,
  isSameDay, monthRange, monthsFor,
} from '../lib/calendar-format';
import { useI18n } from '../lib/useI18n';
import { calendarCategoryLabel } from '../lib/labelHelpers';
import { haptics } from '../lib/useHaptics';

type RowState = 'past' | 'next' | 'normal';

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Calendrier Yumia — DA du 18/11/2026.
 *
 * Fond spatial de l'Accueil, mois en grand titre cristal, grille dans un
 * panneau de verre (balayer à gauche / à droite change de mois), agenda du
 * jour en frise : le prochain événement d'aujourd'hui est marqué du dégradé
 * de marque, ceux déjà passés s'estompent.
 *
 * Les séries récurrentes sont développées côté serveur : l'écran ne manipule
 * que des occurrences concrètes. Ouvrable avec des paramètres pour créer
 * directement un événement depuis une fiche de lieu
 * (`?title=&placeId=&placeName=&address=`).
 */
export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const { t, locale } = useI18n();
  const params = useLocalSearchParams<{
    title?: string; placeId?: string; placeName?: string; address?: string; category?: string;
  }>();

  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  /** Sens du dernier changement de mois : pilote le glissé de la grille. */
  const [dir, setDir] = useState<1 | -1>(1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const { from, to } = monthRange(month);
    const list = await calendarApi.list(accessToken, from, to);
    setEvents(list);
    setLoading(false);
  }, [accessToken, month]);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  // Ouverture depuis une fiche de lieu : pré-remplit et ouvre l'éditeur.
  const prefillTitle = params.title;
  useEffect(() => {
    if (!prefillTitle) return;
    setEditing({
      id: '', occurrenceId: '', title: prefillTitle, notes: null,
      category: params.category ?? 'activity',
      startAt: new Date().toISOString(), endAt: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      allDay: false, recurring: false, rrule: null, reminderMinutes: null,
      placeId: params.placeId ?? null,
      placeName: params.placeName ?? null,
      address: params.address ?? null,
    });
    setEditorOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillTitle]);

  /** Index par jour local — la grille et l'agenda le consultent en O(1). */
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = dayKey(new Date(e.startAt));
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return map;
  }, [events]);

  const dayEvents = useMemo(
    () => [...(eventsByDay.get(dayKey(selected)) ?? [])]
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [eventsByDay, selected],
  );

  /** Événements du mois affiché (la grille déborde sur les mois voisins). */
  const monthCount = events.filter((e) => {
    const d = new Date(e.startAt);
    return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
  }).length;

  // Aujourd'hui : ce qui est passé s'estompe, le prochain est mis en avant.
  const now = new Date();
  const rowStates: RowState[] = [];
  let nextFound = false;
  for (const e of dayEvents) {
    if (!isSameDay(selected, now) || e.allDay) { rowStates.push('normal'); continue; }
    const end = e.endAt ? new Date(e.endAt) : new Date(new Date(e.startAt).getTime() + 3_600_000);
    if (end < now) { rowStates.push('past'); continue; }
    if (!nextFound) { nextFound = true; rowStates.push('next'); continue; }
    rowStates.push('normal');
  }

  const countLabel = (n: number) => (n === 0
    ? t('calendar_nothing_planned')
    : t('calendar_events_count').replace('{n}', String(n)).replace('{s}', n > 1 ? 's' : ''));

  const changeMonth = (n: 1 | -1) => {
    const next = addMonths(month, n);
    const today = new Date();
    setDir(n);
    setMonth(next);
    // Le mois courant rouvre sur aujourd'hui, les autres sur leur 1er jour.
    setSelected(next.getMonth() === today.getMonth() && next.getFullYear() === today.getFullYear() ? today : next);
    haptics.select();
  };

  const goToday = () => {
    const today = new Date();
    setDir(today.getTime() >= month.getTime() ? 1 : -1);
    setMonth(today);
    setSelected(today);
  };

  // Balayer la grille change de mois. Le geste n'est réclamé que s'il est
  // franchement horizontal : un défilement vertical reste à la liste.
  const changeRef = useRef(changeMonth);
  useEffect(() => { changeRef.current = changeMonth; });
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < 50) return;
      const forward = I18nManager.isRTL ? g.dx > 0 : g.dx < 0;
      changeRef.current(forward ? 1 : -1);
    },
  }), []);

  const save = async (draft: EventDraft) => {
    if (!accessToken) return;
    // `editing.id` vide = pré-remplissage depuis une fiche, donc une création.
    if (editing?.id) await calendarApi.update(accessToken, editing.id, draft);
    else await calendarApi.create(accessToken, draft);
    setEditorOpen(false);
    setEditing(null);
    void load();
  };

  const remove = (event: CalendarEvent) => {
    if (!accessToken || !event.id) return;

    // Sur une série, supprimer tout serait destructeur : on propose les deux.
    if (event.recurring) {
      Alert.alert(t('calendar_delete_series_title'), t('calendar_delete_series_body'), [
        { text: t('calendar_cancel'), style: 'cancel' },
        {
          text: t('calendar_this_occurrence'),
          onPress: async () => {
            await calendarApi.removeOccurrence(accessToken, event.id, event.startAt);
            setEditorOpen(false); setEditing(null); void load();
          },
        },
        {
          text: t('calendar_whole_series'),
          style: 'destructive',
          onPress: async () => {
            await calendarApi.remove(accessToken, event.id);
            setEditorOpen(false); setEditing(null); void load();
          },
        },
      ]);
      return;
    }

    Alert.alert(t('calendar_delete_event_title'), event.title, [
      { text: t('calendar_cancel'), style: 'cancel' },
      {
        text: t('calendar_delete'),
        style: 'destructive',
        onPress: async () => {
          await calendarApi.remove(accessToken, event.id);
          setEditorOpen(false); setEditing(null); void load();
        },
      },
    ]);
  };

  const openNew = () => { setEditing(null); setEditorOpen(true); };

  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;
  const slide = (dir > 0 ? FadeInRight : FadeInLeft).duration(280);
  const isRTL = I18nManager.isRTL;

  const header = (
    <View>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <GlassCircleButton label={isRTL ? '→' : '←'} onPress={() => router.back()} />
        <GlassChipButton label={t('calendar_today')} onPress={goToday} />
      </View>

      {/* Mois en grand, flèches de verre de part et d'autre. */}
      <View style={styles.hero}>
        <GlassCircleButton label={isRTL ? '›' : '‹'} onPress={() => changeMonth(-1)} size={40} />
        <Animated.View key={`t${monthKey}`} entering={slide} style={styles.heroCenter}>
          <CrystalTitle
            center
            title={capitalize(monthsFor(locale)[month.getMonth()])}
            subtitle={`${month.getFullYear()} · ${countLabel(monthCount)}`}
          />
        </Animated.View>
        <GlassCircleButton label={isRTL ? '‹' : '›'} onPress={() => changeMonth(1)} size={40} />
      </View>

      <View style={[styles.gridPanel, GLASS]} {...swipe.panHandlers}>
        <Animated.View key={`g${monthKey}`} entering={slide}>
          <MonthGrid month={month} selected={selected} eventsByDay={eventsByDay} onSelect={setSelected} />
        </Animated.View>
      </View>

      <View style={styles.agendaHead}>
        <Animated.View key={dayKey(selected)} entering={FadeIn.duration(240)} style={styles.flex1}>
          <GradientText style={styles.agendaTitle} colors={gradients.crystal} numberOfLines={1}>
            {capitalize(formatLongDate(selected, locale))}
          </GradientText>
          <Text style={styles.agendaCount}>{countLabel(dayEvents.length)}</Text>
        </Animated.View>
        {/* Passerelle vers le bloc-notes : les notes de la journée se
            retrouvent au même endroit que le programme de cette journée. */}
        <GlassChipButton
          label={t('calendar_notes_of_day')}
          onPress={() => router.push(`/notebook?date=${dayKey(selected)}` as never)}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <SpaceBackdrop />

      <FlatList
        data={loading ? [] : dayEvents}
        keyExtractor={(e) => e.occurrenceId}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor="#fff"
            colors={[colors.brand]}
            progressBackgroundColor={colors.surface}
          />
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.loading}><ActivityIndicator color="#fff" /></View>
        ) : (
          <PlannerEmpty emoji="🗓️" text={t('calendar_empty_events')}>
            <BrandPill label={`＋ ${t('ee_new_event')}`} onPress={openNew} />
          </PlannerEmpty>
        )}
        renderItem={({ item, index }) => (
          <Reveal index={Math.min(index, 6)}>
            <TimelineRow
              event={item}
              state={rowStates[index] ?? 'normal'}
              isFirst={index === 0}
              isLast={index === dayEvents.length - 1}
              onPress={() => { setEditing(item); setEditorOpen(true); }}
            />
          </Reveal>
        )}
      />

      <BrandFab onPress={openNew} bottom={insets.bottom + 20} accessibilityLabel={t('ee_new_event')} />

      <EventEditor
        visible={editorOpen}
        initial={editing}
        initialDate={selected}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSave={(d) => void save(d)}
        onDelete={remove}
      />
    </View>
  );
}

/** Une étape de la frise : heure, nœud sur le fil, carte de verre. */
function TimelineRow({ event, state, isFirst, isLast, onPress }: {
  event: CalendarEvent;
  state: RowState;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const meta = CATEGORY_META[event.category as EventCategory] ?? CATEGORY_META.personal;
  const foreign = isForeignTimezone(event.timezone);
  const metaLine = `${calendarCategoryLabel(t, event.category, meta.label)}`
    + `${event.placeName ? ` · ${event.placeName}` : ''}`
    + `${event.recurring ? t('calendar_recurring_suffix') : ''}`;

  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={[styles.tlRow, state === 'past' && styles.tlPast]}>
      <View style={styles.tlTime}>
        {event.allDay ? (
          <Text style={styles.tlAllDay} numberOfLines={2}>{t('calendar_all_day')}</Text>
        ) : (
          <>
            <Text style={styles.tlStart}>{formatEventTime(event.startAt, event.timezone)}</Text>
            {event.endAt ? <Text style={styles.tlEnd}>{formatEventTime(event.endAt, event.timezone)}</Text> : null}
          </>
        )}
      </View>

      <View style={styles.tlRail}>
        {isFirst && isLast ? null : (
          <View style={[styles.tlLine, isFirst && styles.tlLineFirst, isLast && styles.tlLineLast]} />
        )}
        {state === 'next' ? (
          <View style={styles.tlNodeGlow}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tlNodeNext} />
          </View>
        ) : (
          <View style={[styles.tlNode, state === 'past' && styles.tlNodePast]} />
        )}
      </View>

      <View style={[styles.tlCard, GLASS, state === 'next' && styles.tlCardNext]}>
        <View style={styles.tlEmoji}>
          <Text style={styles.tlEmojiTxt}>{meta.emoji}</Text>
        </View>
        <View style={styles.tlBody}>
          <Text style={styles.tlTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.tlMeta} numberOfLines={1}>{metaLine}</Text>
          {/* Signalé explicitement : sinon l'heure affichée semblerait fausse
              à qui consulte depuis un autre fuseau. */}
          {foreign ? (
            <Text style={styles.tlTz}>{t('calendar_timezone_hour').replace('{tz}', event.timezone.split('/').pop() ?? '')}</Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

const NODE_TOP = 20;
const NODE = 11;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SPACE_BLACK },
  flex1: { flex: 1 },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },

  hero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.md, gap: spacing.sm,
  },
  heroCenter: { flex: 1, alignItems: 'center' },

  gridPanel: {
    marginHorizontal: spacing.md, borderRadius: radius.xl,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xs,
  },

  agendaHead: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md,
  },
  agendaTitle: { ...typography.title, fontWeight: '900', color: '#fff' },
  agendaCount: { ...typography.caption, color: colors.textMuted, fontWeight: '700', marginTop: 2 },

  // ── Frise ──
  tlRow: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  tlPast: { opacity: 0.5 },
  tlTime: { width: 50, paddingTop: NODE_TOP - 6, alignItems: 'flex-end' },
  tlStart: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tlEnd: { ...typography.label, color: colors.textMuted, fontVariant: ['tabular-nums'], marginTop: 1 },
  tlAllDay: { ...typography.label, color: colors.textSecondary, fontWeight: '800', textAlign: 'right' },

  tlRail: { width: 26, alignItems: 'center' },
  tlLine: {
    position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  tlLineFirst: { top: NODE_TOP + NODE / 2 },
  tlLineLast: { bottom: undefined, height: NODE_TOP + NODE / 2 },
  tlNode: {
    marginTop: NODE_TOP, width: NODE, height: NODE, borderRadius: NODE / 2,
    backgroundColor: '#F4F7FB', borderWidth: 2, borderColor: SPACE_BLACK,
  },
  tlNodePast: { backgroundColor: SPACE_BLACK, borderColor: 'rgba(255,255,255,0.45)', borderWidth: 1.5 },
  tlNodeGlow: {
    marginTop: NODE_TOP - 2, width: NODE + 4, height: NODE + 4, borderRadius: (NODE + 4) / 2,
    shadowColor: colors.brand, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  tlNodeNext: { width: NODE + 4, height: NODE + 4, borderRadius: (NODE + 4) / 2 },

  tlCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.lg, padding: spacing.sm, paddingEnd: spacing.md, minHeight: 60,
  },
  tlCardNext: { borderColor: 'rgba(255,255,255,0.30)' },
  tlEmoji: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  tlEmojiTxt: { fontSize: 19 },
  tlBody: { flex: 1, gap: 2 },
  tlTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '800' },
  tlMeta: { ...typography.caption, color: colors.textMuted },
  tlTz: { ...typography.label, color: colors.textSecondary },
});
