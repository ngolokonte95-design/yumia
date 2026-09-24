/**
 * Affiché à la place de Tind et des Rencontres pour un membre dont on ne
 * peut pas établir qu'il est majeur (cf. lib/dating-age.ts).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';

export function AdultsOnlyNotice({ birthYearMissing }: { birthYearMissing: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <View style={styles.box}>
      <Text style={styles.emoji}>🔞</Text>
      <Text style={styles.title}>{t('adults_only_title')}</Text>
      <Text style={styles.body}>{t(birthYearMissing ? 'adults_only_missing_year' : 'adults_only_body')}</Text>
      {birthYearMissing && (
        <Pressable onPress={() => router.push('/edit-social-profile')} hitSlop={8}>
          <Text style={styles.link}>{t('adults_only_add_year')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emoji: { fontSize: 44 },
  title: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  link: { fontSize: 14, fontWeight: '700', color: colors.brandSoft, marginTop: spacing.sm },
});
