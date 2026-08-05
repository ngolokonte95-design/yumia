import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNIVERSE_META, UNIVERSE_CATEGORIES } from '@yumia/shared';
import type { Mode } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { YumiaLogo } from '../../components/YumiaLogo';
import { useLocation } from '../../lib/useLocation';
import { useAuth } from '../../lib/auth-context';
import { useI18n } from '../../lib/useI18n';
import { useWeather } from '../../lib/useWeather';
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

const FEATURE_SHORTCUTS: { key: string; emoji: string; label: string; route: string }[] = [
  { key: 'swipe', emoji: '💫', label: 'Swipe', route: '/swipe' },
  { key: 'chatbot', emoji: '🤖', label: 'Assistant', route: '/chatbot' },
  { key: 'itinerary', emoji: '✨', label: 'Itinéraire', route: '/itinerary' },
  { key: 'nearby', emoji: '📍', label: 'Nearby', route: '/nearby-users' },
  { key: 'quests', emoji: '🏆', label: 'Quêtes', route: '/quests' },
  { key: 'chat', emoji: '💬', label: 'Messages', route: '/chat' },
  { key: 'sorties', emoji: '🎟️', label: 'Sorties', route: '/sorties' },
  { key: 'group', emoji: '👥', label: 'Groupe', route: '/group' },
  { key: 'surprise', emoji: '🎲', label: 'Surprise', route: '/surprise' },
  { key: 'leaderboard', emoji: '🏆', label: 'Classement', route: '/leaderboard' },
  { key: 'saved', emoji: '🤍', label: 'Sauvegardés', route: '/saved' },
  { key: 'guides', emoji: '🧑‍🏫', label: 'Guides', route: '/guides' },
];

const MODE_CHIPS: { key: Mode; emoji: string; label: string; mood: string }[] = [
  { key: 'date', emoji: '❤️', label: 'Date', mood: 'date' },
  { key: 'family', emoji: '👨‍👩‍👧', label: 'Famille', mood: 'famille' },
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
  const weather = useWeather(coords.lat, coords.lng);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Logo Yumia — bien visible en haut de la Home */}
      <View style={[styles.section, { alignItems: 'center', marginBottom: spacing.sm }]}>
        <YumiaLogo height={150} />
      </View>

      {/* Greeting contextuel */}
      <View style={styles.section}>
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greetTitle}</Text>
            <Text style={styles.subGreeting}>
              {city ? `📍 ${city} · ` : ''}{greetSub}
            </Text>
          </View>
          {/* La pastille météo ouvre l'écran météo complet. `as never` : les
              types de routes sont générés par le serveur de dev et ne
              connaissent /weather qu'après un premier démarrage — même
              convention que les autres push de cet écran. */}
          {weather ? (
            <Pressable style={styles.weatherPill} onPress={() => router.push('/weather' as never)}>
              <Text style={styles.weatherText}>
                {weatherEmoji(weather.condition)} {weather.tempC}°
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Barre de recherche conversationnelle */}
      <View style={styles.section}>
        <Pressable style={styles.search} onPress={() => router.push('/search')}>
          <Text style={styles.searchText}>{t('home_search_placeholder')}</Text>
        </Pressable>
      </View>

      {/* Fonctionnalités — raccourcis compacts */}
      <View style={styles.section}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutsRow}>
          {FEATURE_SHORTCUTS.map((s) => (
            <Pressable key={s.key} style={styles.shortcut} onPress={() => router.push(s.route as never)}>
              <Text style={styles.shortcutEmoji}>{s.emoji}</Text>
              <Text style={styles.shortcutLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Modes IA — toggle humeur */}
      <View style={styles.section}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modesRow}>
          {MODE_CHIPS.map((m) => (
            <Pressable
              key={m.key}
              style={styles.modeChip}
              onPress={() => router.push(`/itinerary?mood=${m.mood}` as never)}
            >
              <Text style={styles.modeEmoji}>{m.emoji}</Text>
              <Text style={styles.modeLabel}>{m.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Tous les univers — groupés par catégorie */}
      {UNIVERSE_CATEGORIES.map((cat) => (
        <View key={cat.label} style={styles.section}>
          <Text style={styles.sectionTitle}>{cat.emoji} {cat.label}</Text>
          <View style={styles.universeGrid}>
            {cat.universes.map((u) => (
              <Pressable key={u} style={styles.universeCard} onPress={() => router.push(universeRoute(u) as never)}>
                <UniverseIcon u={u} />
                <Text style={styles.universeLabel}>{UNIVERSE_META[u].labelFr}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function weatherEmoji(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes('thunder')) return '⛈️';
  if (c.includes('snow')) return '❄️';
  if (c.includes('heavy rain') || c.includes('shower')) return '🌧️';
  if (c.includes('rain') || c.includes('drizzle')) return '🌦️';
  if (c.includes('fog')) return '🌫️';
  if (c.includes('overcast')) return '☁️';
  if (c.includes('partly') || c.includes('mostly')) return '⛅';
  return '☀️';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  greeting: { ...typography.display, color: colors.textPrimary },
  subGreeting: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  weatherPill: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  weatherText: { ...typography.caption, color: colors.textSecondary },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  searchText: { ...typography.body, color: colors.textMuted },
  shortcutsRow: { gap: spacing.sm, paddingRight: spacing.md },
  shortcut: {
    width: 72,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  shortcutEmoji: { fontSize: 22 },
  shortcutLabel: { ...typography.label, color: colors.textSecondary, fontSize: 11 },
  modesRow: { gap: spacing.sm, paddingRight: spacing.md },
  modeChip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
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
