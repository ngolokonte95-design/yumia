import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard, PressableScale, Reveal } from '../components/ui';
import { MonthGrid } from '../components/calendar/MonthGrid';
import { EventEditor } from '../components/calendar/EventEditor';
import { useAuth } from '../lib/auth-context';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import {
  calendarApi, CATEGORY_META,
  type CalendarEvent, type EventCategory, type EventDraft,
} from '../lib/calendar-api';
import {
  addMonths, dayKey, formatEventTime, formatLongDate, isForeignTimezone,
  isSameDay, monthRange, MONTHS,
} from '../lib/calendar-format';

/**
 * Calendrier Yumia.
 *
 * Grille mensuelle + agenda du jour sélectionné. Les séries récurrentes sont
 * développées côté serveur : l'écran ne manipule que des occurrences concrètes.
 *
 * Ouvrable avec des paramètres pour créer directement un événement depuis une
 * fiche de lieu (`?title=&placeId=&placeName=&address=`).
 */
export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{
    title?: string; placeId?: string; placeName?: string; address?: string; category?: string;
  }>();

  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
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

  const dayEvents = eventsByDay.get(dayKey(selected)) ?? [];

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
      Alert.alert('Supprimer', 'Cet événement se répète.', [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Cette occurrence',
          onPress: async () => {
            await calendarApi.removeOccurrence(accessToken, event.id, event.startAt);
            setEditorOpen(false); setEditing(null); void load();
          },
        },
        {
          text: 'Toute la série',
          style: 'destructive',
          onPress: async () => {
            await calendarApi.remove(accessToken, event.id);
            setEditorOpen(false); setEditing(null); void load();
          },
        },
      ]);
      return;
    }

    Alert.alert('Supprimer l\'événement ?', event.title, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await calendarApi.remove(accessToken, event.id);
          setEditorOpen(false); setEditing(null); void load();
        },
      },
    ]);
  };

  const openNew = () => { setEditing(null); setEditorOpen(true); };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={gradients.brandSoft} style={styles.ambient} pointerEvents="none" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>←</Text>
        </PressableScale>
        <View style={styles.monthNav}>
          <PressableScale onPress={() => setMonth((m) => addMonths(m, -1))} hitSlop={12}>
            <Text style={styles.navArrow}>‹</Text>
          </PressableScale>
          <Text style={styles.monthLabel}>
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </Text>
          <PressableScale onPress={() => setMonth((m) => addMonths(m, 1))} hitSlop={12}>
            <Text style={styles.navArrow}>›</Text>
          </PressableScale>
        </View>
        <PressableScale onPress={openNew} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>＋</Text>
        </PressableScale>
      </View>

      <PressableScale
        onPress={() => { const now = new Date(); setMonth(now); setSelected(now); }}
        style={styles.todayBtn}
      >
        <Text style={styles.todayTxt}>Aujourd'hui</Text>
      </PressableScale>

      <MonthGrid
        month={month}
        selected={selected}
        eventsByDay={eventsByDay}
        onSelect={setSelected}
      />

      <View style={styles.agendaHeader}>
        <Text style={styles.agendaTitle}>{formatLongDate(selected)}</Text>
        <Text style={styles.agendaCount}>
          {dayEvents.length === 0 ? 'Rien de prévu' : `${dayEvents.length} événement${dayEvents.length > 1 ? 's' : ''}`}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={dayEvents}
          keyExtractor={(e) => e.occurrenceId}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🗓️</Text>
              <Text style={styles.emptyTxt}>
                Aucun événement ce jour-là.{'\n'}Appuie sur ＋ pour en ajouter un.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Reveal index={Math.min(index, 6)}>
              <EventRow
                event={item}
                onPress={() => { setEditing(item); setEditorOpen(true); }}
              />
            </Reveal>
          )}
        />
      )}

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

function EventRow({ event, onPress }: { event: CalendarEvent; onPress: () => void }) {
  const meta = CATEGORY_META[event.category as EventCategory] ?? CATEGORY_META.personal;
  const foreign = isForeignTimezone(event.timezone);

  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.rowWrap}>
      <GlassCard rounded={radius.md}>
        <View style={styles.row}>
          <View style={[styles.stripe, { backgroundColor: meta.color }]} />

          <View style={styles.rowTime}>
            {event.allDay ? (
              <Text style={styles.allDay}>Journée</Text>
            ) : (
              <>
                <Text style={styles.startTime}>
                  {formatEventTime(event.startAt, event.timezone)}
                </Text>
                {event.endAt && (
                  <Text style={styles.endTime}>
                    {formatEventTime(event.endAt, event.timezone)}
                  </Text>
                )}
              </>
            )}
          </View>

          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>{event.title}</Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {meta.emoji} {meta.label}
              {event.placeName ? ` · ${event.placeName}` : ''}
              {event.recurring ? ' · ↻' : ''}
            </Text>
            {/* Signalé explicitement : sinon l'heure affichée semblerait fausse
                à qui consulte depuis un autre fuseau. */}
            {foreign && (
              <Text style={styles.tz}>🌍 heure de {event.timezone.split('/').pop()}</Text>
            )}
          </View>
        </View>
      </GlassCard>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  ambient: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  headerBtn: { width: 36 },
  headerIcon: { fontSize: 24, color: colors.textPrimary, fontWeight: '700' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navArrow: { fontSize: 26, color: colors.brand, fontWeight: '700' },
  monthLabel: { ...typography.heading, color: colors.textPrimary, minWidth: 130, textAlign: 'center' },

  todayBtn: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: spacing.md },
  todayTxt: { ...typography.caption, color: colors.brandSoft, fontWeight: '600' },

  agendaHeader: {
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  agendaTitle: { ...typography.title, color: colors.textPrimary },
  agendaCount: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  list: { paddingHorizontal: spacing.md },
  rowWrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.sm },
  stripe: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  rowTime: { width: 52, alignItems: 'center' },
  startTime: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  endTime: { ...typography.label, color: colors.textMuted },
  allDay: { ...typography.label, color: colors.textSecondary, fontWeight: '700' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  rowMeta: { ...typography.caption, color: colors.textMuted },
  tz: { ...typography.label, color: colors.brandSoft },

  empty: { alignItems: 'center', paddingTop: spacing.xl, gap: spacing.sm },
  emptyEmoji: { fontSize: 44 },
  emptyTxt: {
    ...typography.body, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 21,
  },
});
