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
 *
 * Mise en scène (17/11/2026) : logo en grand, message dans plusieurs langues,
 * langues en liste vitrée qui apparaît en cascade ; la langue touchée prend
 * la coche au dégradé de marque le temps de la transition.
 */
import { useState } from 'react';
import { FlatList, I18nManager, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { SUPPORTED_LOCALES, type LocaleInfo } from '../lib/locales';
import { saveDeviceLocale } from '../lib/device-locale';
import { YumiaLogo } from '../components/YumiaLogo';
import { PressableScale, Reveal } from '../components/ui';
import { haptics } from '../lib/useHaptics';
import { BrandDot, CHEVRON, GLASS } from '../components/profile/ProfileChrome';

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
  // Langue touchée : coche affichée pendant l'enregistrement (visuel seul).
  const [picked, setPicked] = useState<string | null>(null);

  async function select(loc: LocaleInfo) {
    await saveDeviceLocale(loc.code);
    const rtl = loc.rtl === true;
    if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
    router.replace('/login');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Reveal index={0} style={styles.header}>
        <YumiaLogo height={96} />
        <Text style={styles.title}>{GREETING_LINES[1]}</Text>
        <View style={styles.greetings}>
          {GREETING_LINES.filter((_, i) => i !== 1).map((line) => (
            <Text key={line} style={styles.greeting}>{line}</Text>
          ))}
        </View>
      </Reveal>
      <FlatList
        data={SUPPORTED_LOCALES}
        keyExtractor={(l) => l.code}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const active = picked === item.code;
          return (
            <Reveal index={Math.min(index + 1, 8)} from="fade">
              <PressableScale
                style={[styles.row, GLASS, active && styles.rowActive]}
                scaleTo={0.97}
                onPress={() => {
                  haptics.select();
                  setPicked(item.code);
                  void select(item);
                }}
              >
                <View style={styles.flagBubble}>
                  <Text style={styles.flag}>{item.flag}</Text>
                </View>
                <Text style={styles.nativeLabel}>{item.nativeLabel}</Text>
                {active ? <BrandDot label="✓" size={28} /> : <Text style={styles.chevron}>{CHEVRON}</Text>}
              </PressableScale>
            </Reveal>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: 6 },
  title: { color: colors.textPrimary, fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginTop: spacing.sm },
  greetings: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    columnGap: spacing.md, rowGap: 2, paddingHorizontal: spacing.lg,
  },
  greeting: { ...typography.caption, color: colors.textMuted },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  rowActive: { borderColor: colors.brand, borderWidth: 1 },
  flagBubble: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  flag: { fontSize: 26 },
  nativeLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '700', flex: 1, fontSize: 16 },
  chevron: { color: colors.textMuted, fontSize: 22, fontWeight: '300', marginTop: -2 },
});
