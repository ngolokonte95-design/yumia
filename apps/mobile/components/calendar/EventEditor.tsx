import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { PressableScale } from '../ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  CATEGORIES, CATEGORY_META,
  type CalendarEvent, type EventCategory, type EventDraft,
} from '../../lib/calendar-api';
import { addDays, formatLongDate, MONTHS } from '../../lib/calendar-format';
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

      <Text style={styles.time}>{pad(value.getHours())}:{pad(value.getMinutes())}</Text>

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
  return (
    <View style={styles.stepper}>
      <PressableScale onPress={() => onChange(addDays(value, -1))} style={styles.stepBtn} hitSlop={8}>
        <Text style={styles.stepTxt}>◀</Text>
      </PressableScale>
      <Text style={styles.dayLabel} numberOfLines={1}>
        {formatLongDate(value)} {value.getFullYear() !== new Date().getFullYear() ? value.getFullYear() : ''}
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <PressableScale onPress={onClose} hitSlop={10}>
              <Text style={styles.cancel}>{t('ee_cancel')}</Text>
            </PressableScale>
            <Text style={styles.sheetTitle}>
              {initial ? t('ee_modify') : t('ee_new_event')}
            </Text>
            <PressableScale onPress={submit} hitSlop={10} disabled={!title.trim()}>
              <Text style={[styles.save, !title.trim() && styles.saveDisabled]}>OK</Text>
            </PressableScale>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.titleInput}
              placeholder={t('ee_title_placeholder')}
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              autoFocus={!initial}
            />

            {/* Catégories */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catRow}
            >
              {CATEGORIES.map((c) => {
                const meta = CATEGORY_META[c];
                const active = category === c;
                return (
                  <PressableScale key={c} scaleTo={0.94} onPress={() => setCategory(c)}>
                    <View style={[
                      styles.cat,
                      active && { backgroundColor: meta.color, borderColor: meta.color },
                    ]}>
                      <Text style={[styles.catTxt, active && styles.catTxtActive]}>
                        {meta.emoji} {calendarCategoryLabel(t, c, meta.label)}
                      </Text>
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>

            <Field label={t('ee_field_date')}>
              <DayPicker value={start} onChange={setStart} />
            </Field>

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>{t('ee_all_day')}</Text>
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
                      <PressableScale key={m} scaleTo={0.94} onPress={() => setDurationMin(m)}>
                        <View style={[styles.chip, durationMin === m && styles.chipActive]}>
                          <Text style={[styles.chipTxt, durationMin === m && styles.chipTxtActive]}>
                            {m < 60 ? t('ee_min_short').replace('{n}', String(m)) : t('ee_hour_short').replace('{n}', String(m / 60))}
                          </Text>
                        </View>
                      </PressableScale>
                    ))}
                  </View>
                </Field>
              </>
            )}

            <Field label={t('ee_field_repeat')}>
              <View style={styles.chipRow}>
                {REPEATS.map((r) => (
                  <PressableScale key={r.labelKey} scaleTo={0.94} onPress={() => setRrule(r.rrule)}>
                    <View style={[styles.chip, rrule === r.rrule && styles.chipActive]}>
                      <Text style={[styles.chipTxt, rrule === r.rrule && styles.chipTxtActive]}>
                        {t(r.labelKey)}
                      </Text>
                    </View>
                  </PressableScale>
                ))}
              </View>
            </Field>

            <Field label={t('ee_field_reminder')}>
              <View style={styles.chipRow}>
                {REMINDERS.map((r) => (
                  <PressableScale key={r.labelKey} scaleTo={0.94} onPress={() => setReminder(r.minutes)}>
                    <View style={[styles.chip, reminder === r.minutes && styles.chipActive]}>
                      <Text style={[styles.chipTxt, reminder === r.minutes && styles.chipTxtActive]}>
                        {t(r.labelKey)}
                      </Text>
                    </View>
                  </PressableScale>
                ))}
              </View>
            </Field>

            <Field label={t('ee_field_notes')}>
              <TextInput
                style={styles.notesInput}
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
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
  sheetTitle: { ...typography.heading, color: colors.textPrimary },
  cancel: { ...typography.body, color: colors.textMuted },
  save: { ...typography.body, color: colors.brand, fontWeight: '700' },
  saveDisabled: { opacity: 0.4 },

  titleInput: {
    ...typography.title, color: colors.textPrimary,
    paddingVertical: spacing.sm, marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  catRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  cat: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  catTxt: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  catTxtActive: { color: '#fff', fontWeight: '700' },

  field: { marginTop: spacing.md, gap: spacing.sm },
  fieldLabel: {
    ...typography.label, color: colors.textMuted, textTransform: 'uppercase',
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md,
  },

  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  stepBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.sm, backgroundColor: colors.surfaceElevated,
  },
  stepTxt: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  time: { ...typography.title, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  dayLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '600', flex: 1, textAlign: 'center' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  chipTxtActive: { color: '#fff', fontWeight: '700' },

  notesInput: {
    ...typography.body, color: colors.textPrimary,
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, minHeight: 80, textAlignVertical: 'top',
  },
  deleteBtn: { marginTop: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  deleteTxt: { ...typography.body, color: colors.danger, fontWeight: '600' },
});
