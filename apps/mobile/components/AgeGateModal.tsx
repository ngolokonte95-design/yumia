/**
 * Barrière d'âge — demandée avant de créer un compte.
 *
 * Deux principes des boutiques, respectés ici :
 *  - écran *neutre* : aucun champ pré-rempli, et rien n'indique quelle date
 *    passe. Une barrière qui souffle la réponse ne barre rien.
 *  - refus sans deuxième chance : si la date saisie est sous la limite, on
 *    n'affiche pas le formulaire à nouveau — l'écran reste sur le refus, avec
 *    une seule sortie.
 *
 * Le composant ne crée pas de compte : il rend une date (AAAA-MM-JJ) à
 * l'appelant, qui décide quoi en faire. Utilisé par l'inscription sociale
 * (Google / Apple), où le serveur réclame la date en cours de route.
 */
import { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import { MIN_SIGNUP_AGE, ageFromIso, toIsoBirthDate } from '../lib/age-gate';

interface Props {
  visible: boolean;
  /** Fermeture volontaire (croix, retour Android) — la création est abandonnée. */
  onCancel: () => void;
  /** Date valide et au-dessus de la limite. */
  onSubmit: (birthDate: string) => void;
}

export function AgeGateModal({ visible, onCancel, onSubmit }: Props) {
  const { t } = useI18n();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  function submit() {
    const iso = toIsoBirthDate(Number(day), Number(month), Number(year));
    if (!iso) {
      setError(t('age_gate_invalid'));
      return;
    }
    const age = ageFromIso(iso);
    if (age === null || age < MIN_SIGNUP_AGE) {
      setRejected(true);
      return;
    }
    setError(null);
    onSubmit(iso);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        {rejected ? (
          <>
            <Text style={styles.title}>{t('age_gate_denied_title')}</Text>
            <Text style={styles.subtitle}>
              {t('age_gate_denied_body').replace('{n}', String(MIN_SIGNUP_AGE))}
            </Text>
            <Pressable style={styles.button} onPress={onCancel}>
              <Text style={styles.buttonText}>{t('close')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>{t('age_gate_title')}</Text>
            <Text style={styles.subtitle}>{t('age_gate_subtitle')}</Text>
            <AgeGateFields
              day={day}
              month={month}
              year={year}
              onDay={setDay}
              onMonth={setMonth}
              onYear={setYear}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.button} onPress={submit}>
              <Text style={styles.buttonText}>{t('continue_btn')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

/**
 * Les trois champs jour / mois / année, extraits pour que l'écran
 * d'inscription par email les pose directement dans son formulaire : là-bas la
 * date est demandée d'emblée, sans passer par la modale.
 */
export function AgeGateFields({
  day,
  month,
  year,
  onDay,
  onMonth,
  onYear,
}: {
  day: string;
  month: string;
  year: string;
  onDay: (v: string) => void;
  onMonth: (v: string) => void;
  onYear: (v: string) => void;
}) {
  const { t } = useI18n();
  // `replace` plutôt que keyboardType seul : sur Android le pavé numérique
  // laisse encore passer des caractères (clavier tiers, saisie vocale).
  const digits = (v: string, max: number) => v.replace(/[^0-9]/g, '').slice(0, max);
  return (
    <View style={styles.row}>
      <TextInput
        style={[styles.input, styles.inputSmall]}
        placeholder={t('age_gate_day')}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        value={day}
        onChangeText={(v) => onDay(digits(v, 2))}
        maxLength={2}
      />
      <TextInput
        style={[styles.input, styles.inputSmall]}
        placeholder={t('age_gate_month')}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        value={month}
        onChangeText={(v) => onMonth(digits(v, 2))}
        maxLength={2}
      />
      <TextInput
        style={[styles.input, styles.inputYear]}
        placeholder={t('age_gate_year')}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        value={year}
        onChangeText={(v) => onYear(digits(v, 4))}
        maxLength={4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  inputSmall: { flex: 1 },
  inputYear: { flex: 1.6 },
  error: { ...typography.caption, color: colors.danger },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: { ...typography.heading, color: '#fff' },
});
