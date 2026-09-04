import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNIVERSE_META, UNIVERSE_CATEGORIES } from '@yumia/shared';
import type { Mode } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { YumiaLogo } from '../../components/YumiaLogo';
import { PlanBadgeIcon } from '../../components/Avatar';
import { universeLabel } from '../../lib/universeMeta';
import { useLocation } from '../../lib/useLocation';
import { useAuth } from '../../lib/auth-context';
import { useI18n } from '../../lib/useI18n';
import { WeatherCard } from '../../components/weather/WeatherCard';
import { CannabisIcon } from '../../components/icons/CannabisIcon';

const UNIVERSE_CUSTOM_ICONS: Partial<Record<string, (props: { size: number }) => ReturnType<typeof CannabisIcon>>> = {
  cannabis: CannabisIcon,
};

function UniverseIcon({ u }: { u: string }) {
  const Icon = UNIVERSE_CUSTOM_ICONS[u];
  if (Icon) return <Icon size={26} />;
  return <Text style={styles.universeEmoji}>{UNIVERSE_META[u as keyof typeof UNIVERSE_META]?.emoji ?? '❓'}</Text>;
}

type TFn = (key: Parameters<ReturnType<typeof import('../../lib/useI18n').useI18n>['t']>[0]) => string;

function buildGreeting(name: string, t: TFn): { title: string; sub: string } {
  const h = new Date().getHours();
  const first = name.split(' ')[0];
  if (h >= 5 && h < 12)
    return { title: `${t('greeting_morning')}, ${first}`, sub: t('greeting_sub_morning') };
  if (h >= 12 && h < 18)
    return { title: `${t('greeting_afternoon')}, ${first}`, sub: t('greeting_sub_afternoon') };
  if (h >= 18 && h < 23)
    return { title: `${t('greeting_evening')}, ${first}`, sub: t('greeting_sub_evening') };
  return { title: `${t('greeting_night')}, ${first}`, sub: t('greeting_sub_night') };
}

// Sorties, Guides et Groupe vivent déjà dans Explorer (QUICK_ACTIONS) ;
// Nearby existe dans l'onglet social sous « 🗺️ Carte ». Classement a été
// déplacé ici depuis Explorer (retiré là-bas) — plus de doublon.
const FEATURE_SHORTCUTS: { key: string; emoji: string; label: string; route: string }[] = [
  { key: 'swipe', emoji: '💫', label: 'Swipe', route: '/swipe' },
  { key: 'chatbot', emoji: '🤖', label: 'Assistant', route: '/chatbot' },
  { key: 'itinerary', emoji: '✨', label: 'Itinéraire', route: '/itinerary' },
  { key: 'quests', emoji: '🎯', label: 'Quêtes', route: '/quests' },
  { key: 'chat', emoji: '💬', label: 'Messages', route: '/chat' },
  { key: 'surprise', emoji: '🎲', label: 'Surprise', route: '/surprise' },
  { key: 'leaderboard', emoji: '🏆', label: 'Classement', route: '/leaderboard' },
  { key: 'saved', emoji: '🔖', label: 'Favoris', route: '/favorites' },
  { key: 'calendar', emoji: '🗓️', label: 'Calendrier', route: '/calendar' },
  { key: 'notebook', emoji: '📝', label: 'Notes', route: '/notebook' },
];

const MODE_CHIPS: { key: Mode; emoji: string; label: string; mood: string }[] = [
  { key: 'date', emoji: '❤️', label: 'Date', mood: 'date' },
  { key: 'group', emoji: '👫', label: 'Amis', mood: 'amis' },
  { key: 'travel', emoji: '✈️', label: 'Voyage', mood: 'touriste' },
];

/** Route spéciale par univers (remplace /universe?u= pour certains) */
const UNIVERSE_ROUTE_OVERRIDES: Partial<Record<string, string>> = {
  nightclub: '/nightclub',
};
function universeRoute(u: string): string {
  return UNIVERSE_ROUTE_OVERRIDES[u] ?? `/universe?u=${u}`;
}

/** HOME — « Que faire maintenant ? ». Point de départ de chaque session. */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const { title: greetTitle, sub: greetSub } = buildGreeting(user?.displayName ?? 'toi', t);
  const { coords, city } = useLocation();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Météo — tout en haut, avant même le logo : c'est l'info la plus
          rapide à checker en ouvrant l'app. */}
      <View style={[styles.section, { marginBottom: spacing.sm }]}>
        <WeatherCard lat={coords.lat} lng={coords.lng} />
      </View>

      {/* Logo Yumia — bien visible en haut de la Home */}
      <View style={[styles.section, { alignItems: 'center', marginBottom: spacing.sm }]}>
        <YumiaLogo height={150} />
      </View>

      {/* Greeting contextuel — badge en Row séparée (pas un enfant inline du
          Text) : mélanger une image dans le flux d'un Text bidirectionnel
          casse le rendu en arabe (le badge finit par chevaucher une lettre).
          flex:1 sur le Text le borne correctement en largeur et fait
          automatiquement suivre le sens RTL/LTR du système. */}
      <View style={styles.section}>
        <View style={{ flex: 1 }}>
          <View style={styles.greetingRow}>
            <Text style={styles.greeting} numberOfLines={2}>{greetTitle}</Text>
            <PlanBadgeIcon plan={user?.plan} size={24} />
          </View>
          <Text style={styles.subGreeting}>
            {city ? `📍 ${city} · ` : ''}{greetSub}
          </Text>
        </View>
      </View>

      {/* Barre de recherche conversationnelle */}
      <View style={styles.section}>
        <Pressable style={styles.search} onPress={() => router.push('/search')}>
          <Text style={styles.searchText}>{t('home_search_placeholder')}</Text>
        </Pressable>
      </View>

      {/* Fonctionnalités — raccourcis compacts, sur 2 lignes. Grille en
          pourcentage (pas de largeur fixe) pour que les 5 colonnes tiennent
          toujours sur l'écran, quelle que soit sa largeur (Android inclus). */}
      <View style={styles.section}>
        <View style={styles.shortcutsGrid}>
          {FEATURE_SHORTCUTS.map((s) => (
            <Pressable key={s.key} style={styles.shortcut} onPress={() => router.push(s.route as never)}>
              <Text style={styles.shortcutEmoji}>{s.emoji}</Text>
              <Text style={styles.shortcutLabel} numberOfLines={1}>{t(`home_shortcut_${s.key}` as never)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Modes IA — toggle humeur. Fixes (pas de ScrollView) : seulement 3
          chips, elles tiennent toujours sur une ligne — un ScrollView pour ça
          ne faisait que "rebondir" au toucher sans rien à faire défiler. */}
      <View style={styles.section}>
        <View style={styles.modesRow}>
          {MODE_CHIPS.map((m) => (
            <Pressable
              key={m.key}
              style={styles.modeChip}
              onPress={() => router.push(`/itinerary?mood=${m.mood}` as never)}
            >
              <Text style={styles.modeEmoji}>{m.emoji}</Text>
              <Text style={styles.modeLabel} numberOfLines={1}>{t(`home_mode_${m.key}` as never)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Tous les univers — groupés par catégorie */}
      {UNIVERSE_CATEGORIES.map((cat) => (
        <View key={cat.key} style={styles.section}>
          <Text style={styles.sectionTitle}>{cat.emoji} {t(`category_${cat.key}` as never)}</Text>
          <View style={styles.universeGrid}>
            {cat.universes.map((u) => (
              <Pressable key={u} style={styles.universeCard} onPress={() => router.push(universeRoute(u) as never)}>
                <UniverseIcon u={u} />
                <Text style={styles.universeLabel}>{universeLabel(t, u)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // flex:1 (= flexBasis:0 + flexShrink) borne le texte à la largeur
  // restante après le badge, quel que soit le sens RTL/LTR — sans ça
  // il déborde de l'écran sur Android sur les textes un peu longs.
  greeting: { ...typography.display, color: colors.textPrimary, flex: 1, minWidth: 0 },
  subGreeting: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  searchText: { ...typography.body, color: colors.textMuted },
  shortcutsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shortcut: {
    width: '18%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 7,
    alignItems: 'center',
    gap: 3,
  },
  shortcutEmoji: { fontSize: 20 },
  shortcutLabel: { ...typography.label, color: colors.textSecondary, fontSize: 10 },
  modesRow: { flexDirection: 'row', gap: spacing.sm },
  modeChip: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  modeChipActive: {
    backgroundColor: `${colors.brand}18`,
    borderColor: colors.brand,
  },
  modeEmoji: { fontSize: 16 },
  modeLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  modeLabelActive: { color: colors.brandSoft },
  universeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  universeCard: {
    width: '22.5%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 3,
  },
  universeEmoji: { fontSize: 22 },
  universeLabel: { ...typography.label, color: colors.textSecondary, textAlign: 'center', fontSize: 9, lineHeight: 12 },
  sectionTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md },
});
