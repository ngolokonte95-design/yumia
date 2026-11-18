import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { GradientText, PressableScale } from '../ui';
import { colors, gradients, radius, spacing, typography } from '../../theme/tokens';
import { CrystalChip, FieldLabel, GLASS, GlassSheet, SheetHeader } from './PlannerChrome';
import {
  CATEGORIES, CATEGORY_META,
  type CalendarEvent, type EventCategory, type EventDraft,
} from '../../lib/calendar-api';
import { addDays, formatLongDate } from '../../lib/calendar-format';
import { useI18n } from '../../lib/useI18n';
import { calendarCategoryLabel } from '../../lib/labelHelpers';
import type { TranslationKey } from '../../lib/translations';

/** Récurrences proposées — le sous-ensemble réellement utilisé. */
const REPEATS: { labelKey: TranslationKey; rrule: string | null }[] = [
  { labelKey: 'ee_repeat_never', rrule: null },
  { labelKey: 'ee_repeat_daily', rrule: 'FREQ=DAILY' },
  { labelKey: 'ee_repeat_weekly', rrule: 'FREQ=WEEKLY' },
  { labelKey: 'ee_repeat_monthly', rrule: 'FREQ=MONTHLY' },
  { labelKey: 'ee_repeat_yearly', rrule: 'FREQ=YEARLY' },
];

const REMINDERS: { labelKey: TranslationKey; minutes: number | null }[] = [
  { labelKey: 'ee_reminder_none', minutes: null },
  { labelKey: 'ee_reminder_15min', minutes: 15 },
  { labelKey: 'ee_reminder_1h', minutes: 60 },
  { labelKey: 'ee_reminder_1day', minutes: 1440 },
];

/**
 * Sélecteur d'heure maison, par incréments.
 *
 * Volontairement pas le sélecteur natif : il impose son propre habillage
 * système, incompatible avec l'identité de Yumia. Des pas de 15 minutes
 * couvrent l'usage réel d'un agenda de sorties.
 */
function TimeStepper({
  value, onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const shift = (minutes: number) => onChange(new Date(value.getTime() + minutes * 60_000));
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.stepper}>
      <PressableScale onPress={() => shift(-60)} style={styles.stepBtn} hitSlop={8}>
        <Text style={styles.stepTxt}>−1h</Text>
      </PressableScale>
      <PressableScale onPress={() => shift(-15)} style={styles.stepBtn} hitSlop={8}>
        <Text style={styles.stepTxt}>−15</Text>
      </PressableScale>

      <GradientText style={styles.time} colors={gradients.crystal}>
        {`${pad(value.getHours())}:${pad(value.getMinutes())}`}
      </GradientText>

      <PressableScale onPress={() => shift(15)} style={styles.stepBtn} hitSlop={8}>
        <Text style={styles.stepTxt}>+15</Text>
      </PressableScale>
      <PressableScale onPress={() => shift(60)} style={styles.stepBtn} hitSlop={8}>
        <Text style={styles.stepTxt}>+1h</Text>
      </PressableScale>
    </View>
  );
}

/** Sélecteur de jour compact : navigation jour par jour autour de la date. */
function DayPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const { locale } = useI18n();
  return (
    <View style={styles.stepper}>
      <PressableScale onPress={() => onChange(addDays(value, -1))} style={styles.stepBtn} hitSlop={8}>
        <Text style={styles.stepTxt}>◀</Text>
      </PressableScale>
      <Text style={styles.dayLabel} numberOfLines={1}>
        {formatLongDate(value, locale)} {value.getFullYear() !== new Date().getFullYear() ? value.getFullYear() : ''}
      </Text>
      <PressableScale onPress={() => onChange(addDays(value, 1))} style={styles.stepBtn} hitSlop={8}>
        <Text style={styles.stepTxt}>▶</Text>
      </PressableScale>
    </View>
  );
}

/**
 * Création et modification d'un événement.
 *
 * Le fuseau enregistré est celui de l'appareil au moment de la saisie : c'est
 * l'hypothèse juste dans l'immense majorité des cas (on planifie là où on est,
 * ou depuis une fiche de lieu qui fournit son propre fuseau).
 */
export function EventEditor({
  visible, initial, initialDate, onClose, onSave, onDelete,
}: {
  visible: boolean;
  /** Événement existant à modifier, ou `null` pour une création. */
  initial: CalendarEvent | null;
  /** Jour pré-sélectionné à la création. */
  initialDate: Date;
  onClose: () => void;
  onSave: (draft: EventDraft) => void;
  onDelete?: (event: CalendarEvent) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<EventCategory>('personal');
  const [start, setStart] = useState(initialDate);
  const [durationMin, setDurationMin] = useState(60);
  const [allDay, setAllDay] = useState(false);
  const [rrule, setRrule] = useState<string | null>(null);
  const [reminder, setReminder] = useState<number | null>(null);

  // Réinitialise le formulaire à chaque ouverture, sinon on éditerait les
  // restes de la saisie précédente.
  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setTitle(initial.title);
      setNotes(initial.notes ?? '');
      setCategory((initial.category as EventCategory) ?? 'personal');
      setStart(new Date(initial.startAt));
      setDurationMin(initial.endAt
        ? Math.round((new Date(initial.endAt).getTime() - new Date(initial.startAt).getTime()) / 60_000)
        : 60);
      setAllDay(initial.allDay);
      setRrule(initial.rrule);
      setReminder(initial.reminderMinutes);
    } else {
      const d = new Date(initialDate);
      // Par défaut : prochaine heure ronde du jour choisi.
      d.setHours(Math.min(new Date().getHours() + 1, 23), 0, 0, 0);
      setTitle('');
      setNotes('');
      setCategory('personal');
      setStart(d);
      setDurationMin(60);
      setAllDay(false);
      setRrule(null);
      setReminder(null);
    }
  }, [visible, initial, initialDate]);

  const submit = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      notes: notes.trim() || null,
      category,
      startAt: start.toISOString(),
      endAt: allDay ? null : new Date(start.getTime() + durationMin * 60_000).toISOString(),
      allDay,
      rrule,
      reminderMinutes: reminder,
      // Fuseau de l'appareil : on planifie là où on se trouve.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      placeId: initial?.placeId ?? null,
      placeName: initial?.placeName ?? null,
      address: initial?.address ?? null,
    });
  };

  return (
    <GlassSheet visible={visible} onClose={onClose}>
      <SheetHeader
        leftLabel={t('ee_cancel')}
        onLeft={onClose}
        center={(
          <GradientText style={styles.sheetTitle} colors={gradients.crystal} numberOfLines={1}>
            {initial ? t('ee_modify') : t('ee_new_event')}
          </GradientText>
        )}
        onOk={submit}
        okDisabled={!title.trim()}
      />

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.titleInput}
              placeholder={t('ee_title_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              autoFocus={!initial}
            />

            {/* Catégories : serties de cristal une fois choisies, sans couleur. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catRow}
            >
              {CATEGORIES.map((c) => {
                const meta = CATEGORY_META[c];
                return (
                  <CrystalChip
                    key={c}
                    label={`${meta.emoji} ${calendarCategoryLabel(t, c, meta.label)}`}
                    active={category === c}
                    onPress={() => setCategory(c)}
                  />
                );
              })}
            </ScrollView>

            <Field label={t('ee_field_date')}>
              <DayPicker value={start} onChange={setStart} />
            </Field>

            <View style={[styles.switchRow, GLASS]}>
              <Text style={styles.switchLabel}>{t('ee_all_day')}</Text>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ true: colors.brand, false: colors.border }}
              />
            </View>

            {!allDay && (
              <>
                <Field label={t('ee_field_start')}>
                  <TimeStepper value={start} onChange={setStart} />
                </Field>
                <Field label={t('ee_field_duration')}>
                  <View style={styles.chipRow}>
                    {[30, 60, 120, 180].map((m) => (
                      <CrystalChip
                        key={m}
                        label={m < 60 ? t('ee_min_short').replace('{n}', String(m)) : t('ee_hour_short').replace('{n}', String(m / 60))}
                        active={durationMin === m}
                        onPress={() => setDurationMin(m)}
                      />
                    ))}
                  </View>
                </Field>
              </>
            )}

            <Field label={t('ee_field_repeat')}>
              <View style={styles.chipRow}>
                {REPEATS.map((r) => (
                  <CrystalChip key={r.labelKey} label={t(r.labelKey)} active={rrule === r.rrule} onPress={() => setRrule(r.rrule)} />
                ))}
              </View>
            </Field>

            <Field label={t('ee_field_reminder')}>
              <View style={styles.chipRow}>
                {REMINDERS.map((r) => (
                  <CrystalChip key={r.labelKey} label={t(r.labelKey)} active={reminder === r.minutes} onPress={() => setReminder(r.minutes)} />
                ))}
              </View>
            </Field>

            <Field label={t('ee_field_notes')}>
              <TextInput
                style={[styles.notesInput, GLASS]}
                placeholder={t('ee_notes_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </Field>

            {initial && onDelete && (
              <PressableScale onPress={() => onDelete(initial)} style={styles.deleteBtn}>
                <Text style={styles.deleteTxt}>
                  {initial.recurring ? t('ee_delete_occurrence') : t('ee_delete_event')}
                </Text>
              </PressableScale>
            )}

            <View style={{ height: spacing.xxl }} />
          </ScrollView>
    </GlassSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheetTitle: { ...typography.heading, fontWeight: '900', color: '#fff' },

  titleInput: {
    fontSize: 26, fontWeight: '800', letterSpacing: -0.4, color: colors.textPrimary,
    paddingVertical: spacing.sm, marginBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  catRow: { gap: spacing.sm, paddingVertical: spacing.sm },

  field: { marginTop: spacing.lg, gap: spacing.sm },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  switchLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },

  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
    ...GLASS, borderRadius: radius.lg,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  stepBtn: {
    paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  stepTxt: { ...typography.caption, color: colors.textSecondary, fontWeight: '800' },
  time: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5, color: '#fff', fontVariant: ['tabular-nums'] },
  dayLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '800', flex: 1, textAlign: 'center' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  notesInput: {
    ...typography.body, color: colors.textPrimary, borderRadius: radius.lg,
    padding: spacing.md, minHeight: 90, textAlignVertical: 'top',
  },
  deleteBtn: { marginTop: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  deleteTxt: { ...typography.body, color: colors.danger, fontWeight: '700' },
});
