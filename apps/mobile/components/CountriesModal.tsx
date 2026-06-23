/**
 * CountriesModal — affiche les pays visités (dédupliqués) avec drapeaux.
 * Accessible depuis le stat "Pays" du profil.
 */
import { Modal, View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { PassportVisit } from '../lib/usePassportStats';

interface Props {
  visible: boolean;
  onClose: () => void;
  visits: PassportVisit[];
}

interface CountryEntry {
  code: string;
  flag: string;
  city: string | null;
}

/** Convertit un code pays ISO 3166-1 alpha-2 en emoji drapeau. */
function countryFlag(code: string): string {
  const offset = 0x1f1e6 - 0x41;
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(c.codePointAt(0)! + offset))
    .join('');
}

function buildCountries(visits: PassportVisit[]): CountryEntry[] {
  const seen = new Map<string, CountryEntry>();
  for (const v of visits) {
    const code = v.place.countryCode;
    if (!seen.has(code)) {
      seen.set(code, {
        code,
        flag: countryFlag(code),
        city: v.place.city,
      });
    }
  }
  return Array.from(seen.values());
}

export function CountriesModal({ visible, onClose, visits }: Props) {
  const countries = buildCountries(visits);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>🌍 Pays explorés</Text>
        <Text style={styles.subtitle}>{countries.length} pays</Text>

        {countries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌐</Text>
            <Text style={styles.emptyText}>Commence à explorer le monde !</Text>
          </View>
        ) : (
          <FlatList
            data={countries}
            keyExtractor={(c) => c.code}
            numColumns={4}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.countryCell}>
                <Text style={styles.flag}>{item.flag}</Text>
                <Text style={styles.code}>{item.code}</Text>
                {item.city ? (
                  <Text style={styles.city} numberOfLines={1}>{item.city}</Text>
                ) : null}
              </View>
            )}
          />
        )}

        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Fermer</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '75%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.md,
  },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyEmoji: { fontSize: 48 },
  emptyText: { ...typography.body, color: colors.textSecondary },

  grid: { paddingBottom: spacing.md },
  row: { gap: spacing.sm, marginBottom: spacing.sm },
  countryCell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    padding: spacing.sm,
    gap: 4,
  },
  flag: { fontSize: 28 },
  code: { ...typography.label, color: colors.textPrimary },
  city: { ...typography.label, color: colors.textMuted, fontSize: 9, textAlign: 'center' },

  closeBtn: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  closeBtnText: { ...typography.body, color: colors.textSecondary },
});
