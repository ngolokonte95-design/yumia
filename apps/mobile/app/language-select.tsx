/**
 * Écran de sélection de langue — tout premier écran vu par un nouvel
 * utilisateur (avant même login/register), voir la garde dans _layout.tsx.
 * Choisir ici traduit immédiatement tout le reste de l'app (login, register,
 * onboarding...), avant même qu'un compte n'existe. Le choix est persisté
 * localement (device-locale.ts) puis synchronisé vers le profil serveur
 * juste après l'inscription (voir auth-context.tsx → register()).
 *
 * Le titre n'est volontairement PAS traduit via t() : cet écran s'affiche
 * avant que la langue ne soit connue, donc t() retomberait sur le français
 * par défaut — illisible pour la plupart des nouveaux utilisateurs dans le
 * monde. On affiche à la place quelques traductions du même message, et
 * chaque option est déjà écrite dans sa propre langue (auto-explicite).
 */
import { FlatList, I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { SUPPORTED_LOCALES, type LocaleInfo } from '../lib/locales';
import { saveDeviceLocale } from '../lib/device-locale';
import { YumiaLogo } from '../components/YumiaLogo';

const GREETING_LINES = [
  'Choisis ta langue',
  'Choose your language',
  'Elige tu idioma',
  'اختر لغتك',
  '选择你的语言',
  'भाषा चुनें',
];

export default function LanguageSelectScreen() {
  const router = useRouter();

  async function select(loc: LocaleInfo) {
    await saveDeviceLocale(loc.code);
    const rtl = loc.rtl === true;
    if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
    router.replace('/login');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <YumiaLogo height={72} />
        {GREETING_LINES.map((line) => (
          <Text key={line} style={styles.greeting}>{line}</Text>
        ))}
      </View>
      <FlatList
        data={SUPPORTED_LOCALES}
        keyExtractor={(l) => l.code}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => void select(item)}>
            <Text style={styles.flag}>{item.flag}</Text>
            <Text style={styles.nativeLabel}>{item.nativeLabel}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md, gap: 4 },
  greeting: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  flag: { fontSize: 28 },
  nativeLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
});
