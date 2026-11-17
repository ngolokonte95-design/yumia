/**
 * HOME — « Que faire maintenant ? ». Point de départ de chaque session.
 *
 * 17/11/2026, deuxième version (demande de l'utilisateur après essai) : retour
 * à la disposition d'origine — logo au centre, raccourcis, humeurs, puis TOUS
 * les univers visibles par catégorie, accessibles en un toucher — mais en
 * beaucoup plus soigné :
 *  - fond = ciel réel de l'endroit où l'on est (WeatherSky) sur TOUT l'écran,
 *    fixe et sans dégradé (un voile dégradé dessinait une barre grise) ;
 *  - logo en grand au centre, salutation et recherche par-dessus ;
 *  - raccourcis en tuiles à pastille dégradée ;
 *  - univers : tuiles d'origine, sobres ; titres de catégorie sans couleur,
 *    en petites capitales espacées + filet fin + nombre d'univers.
 * « Parfait maintenant » et l'accordéon de catégories ont été retirés.
 */
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNIVERSE_CATEGORIES } from '@yumia/shared';
import type { Mode, UniverseCategory } from '@yumia/shared';
import { colors, gradients, radius, spacing, typography } from '../../theme/tokens';
import { UniverseGlyph } from '../../components/UniverseGlyph';
import { YumiaLogo } from '../../components/YumiaLogo';
import { PlanBadgeIcon } from '../../components/Avatar';
import { universeLabel } from '../../lib/universeMeta';
import { useLocation } from '../../lib/useLocation';
import { useAuth } from '../../lib/auth-context';
import { request } from '../../lib/api';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';
import { WeatherSky } from '../../components/weather/WeatherSky';
import { useWeatherReport } from '../../lib/useWeatherReport';
import { dayMomentAt, kindEmoji } from '../../lib/services/weather';
import { PressableScale, Reveal } from '../../components/ui';
import { FeatureTip } from '../../components/FeatureTip';

type TFn = (key: TranslationKey) => string;

/** Hauteur du ciel, hors encoche : logo, salutation et recherche y tiennent. */
const HERO_HEIGHT = 380;

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

// Raccourcis vers les fonctionnalités (Swipe retiré : ses like/dislike
// n'étaient relus nulle part ; Surprise couvre « propose-moi quelque chose »).
// La Boutique est aussi dans Explorer, avec une autre icône.
const FEATURE_SHORTCUTS: { key: string; emoji: string; route: string }[] = [
  { key: 'shop', emoji: '🏬', route: '/shop' },
  { key: 'chatbot', emoji: '🤖', route: '/chatbot' },
  { key: 'itinerary', emoji: '✨', route: '/itinerary' },
  { key: 'quests', emoji: '🎯', route: '/quests' },
  { key: 'chat', emoji: '💬', route: '/chat' },
  { key: 'saved', emoji: '🔖', route: '/favorites' },
  { key: 'leaderboard', emoji: '🏆', route: '/leaderboard' },
  { key: 'surprise', emoji: '🎲', route: '/surprise' },
  { key: 'calendar', emoji: '🗓️', route: '/calendar' },
  { key: 'notebook', emoji: '📝', route: '/notebook' },
];

// `route` (sortie en groupe → l'écran /group dédié) prime sur `mood`
// (itinéraire IA filtré par humeur).
const MODE_CHIPS: { key: Mode | 'groupOuting'; emoji: string; mood?: string; route?: string }[] = [
  { key: 'date', emoji: '❤️', mood: 'date' },
  { key: 'group', emoji: '👫', mood: 'amis' },
  { key: 'travel', emoji: '✈️', mood: 'touriste' },
  { key: 'groupOuting', emoji: '👥', route: '/group' },
];

/** Route spéciale par univers (remplace /universe?u= pour certains). */
const UNIVERSE_ROUTE_OVERRIDES: Partial<Record<string, string>> = {
  nightclub: '/nightclub',
};
function universeRoute(u: string): string {
  return UNIVERSE_ROUTE_OVERRIDES[u] ?? `/universe?u=${u}`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { t } = useI18n();
  const { coords, city } = useLocation();

  // Le ciel animé ne tourne que tant que l'onglet est affiché (batterie).
  const [focused, setFocused] = useState(true);

  // Badge des Messages : conversations non lues, relues à chaque retour sur
  // l'accueil puis toutes les 30 s tant qu'il est affiché.
  const [unreadChats, setUnreadChats] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      let active = true;
      let id: ReturnType<typeof setInterval> | undefined;
      if (accessToken) {
        const refresh = () =>
          request<{ count: number }>('/chat/unread-count', { token: accessToken })
            .then((r) => { if (active) setUnreadChats(r.count); })
            .catch(() => {});
        refresh();
        id = setInterval(refresh, 30_000);
      }
      return () => {
        active = false;
        if (id) clearInterval(id);
        setFocused(false);
      };
    }, [accessToken]),
  );

  const { title: greetTitle, sub: greetSub } = buildGreeting(user?.displayName ?? 'toi', t);

  const { report } = useWeatherReport(coords.lat, coords.lng);
  const current = report?.current;
  const moment = useMemo(
    () => (report ? dayMomentAt(new Date(), report.astro, report.coordinates.lat) : 'day'),
    [report],
  );

  // ── Parallaxe du ciel ─────────────────────────────────────────────────────
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const heroTotal = HERO_HEIGHT + insets.top;
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, heroTotal * 0.65], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, heroTotal], [0, -30], Extrapolation.CLAMP) }],
  }));

  const go = (route: string) => router.push(route as never);

  return (
    <View style={styles.screen}>
      {/* ── Ciel réel en fond de TOUT l'écran, fixe, sans dégradé ──────────
          (17/11, demande de l'utilisateur : le voile dégradé qui fondait le
          ciel dans le fond sombre dessinait une barre grise au milieu). */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {current && focused ? <WeatherSky kind={current.kind} moment={moment} /> : null}
      </View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      >
        {/* ── En-tête sur le ciel ─────────────────────────────────────── */}
        <Animated.View style={[styles.hero, { height: heroTotal, paddingTop: insets.top + spacing.sm }, heroContentStyle]}>
          {/* Météo du moment, en haut à droite — ouvre l'écran Météo. */}
          <View style={styles.heroTop}>
            {current ? (
              <PressableScale style={styles.weatherChip} onPress={() => go('/weather')}>
                <Text style={styles.weatherChipEmoji}>{kindEmoji(current.kind, current.isDay)}</Text>
                <Text style={styles.weatherChipTemp}>{Math.round(current.tempC)}°</Text>
                {city ? <Text style={styles.weatherChipCity} numberOfLines={1}>{city}</Text> : null}
              </PressableScale>
            ) : null}
          </View>

          {/* Logo en grand, au centre. */}
          <View style={styles.logoWrap}>
            <YumiaLogo height={150} />
          </View>

          <View style={styles.heroBottom}>
            {/* Badge en rangée séparée (pas dans le flux du Text) : sinon il
                chevauche une lettre en arabe. */}
            <View style={styles.greetingRow}>
              <Text style={styles.greeting} numberOfLines={2}>{greetTitle}</Text>
              <PlanBadgeIcon plan={user?.plan} size={26} />
            </View>
            <Text style={styles.subGreeting} numberOfLines={2}>
              {city ? `📍 ${city} · ` : ''}{greetSub}
            </Text>

            <PressableScale style={styles.search} onPress={() => go('/search')} scaleTo={0.98}>
              <Text style={styles.searchIcon}>🔍</Text>
              <Text style={styles.searchText} numberOfLines={1}>{t('home_search_placeholder')}</Text>
              <View style={styles.searchGo}>
                <Text style={styles.searchGoText}>→</Text>
              </View>
            </PressableScale>
          </View>
        </Animated.View>

        {/* ── Raccourcis : 2 lignes de 5, largeur en % (tient sur tout écran) ── */}
        <Reveal index={0} style={styles.section}>
          <View style={styles.shortcutsGrid}>
            {FEATURE_SHORTCUTS.map((s) => (
              <PressableScale key={s.key} style={styles.shortcut} onPress={() => go(s.route)} scaleTo={0.92}>
                <LinearGradient colors={gradients.brandSoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.shortcutIcon}>
                  <Text style={styles.shortcutEmoji}>{s.emoji}</Text>
                </LinearGradient>
                {s.key === 'chat' && unreadChats > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadChats > 9 ? '9+' : unreadChats}</Text>
                  </View>
                ) : null}
                <Text style={styles.shortcutLabel} numberOfLines={1}>{t(`home_shortcut_${s.key}` as TranslationKey)}</Text>
              </PressableScale>
            ))}
          </View>
        </Reveal>

        {/* ── Humeurs — 4 pastilles qui se partagent toujours la largeur ── */}
        <Reveal index={1} style={styles.section}>
          <View style={styles.modesRow}>
            {MODE_CHIPS.map((m) => (
              <PressableScale
                key={m.key}
                style={styles.modeChip}
                onPress={() => go(m.route ?? `/itinerary?mood=${m.mood}`)}
              >
                <Text style={styles.modeEmoji}>{m.emoji}</Text>
                <Text style={styles.modeLabel} numberOfLines={1}>
                  {t(`home_mode_${m.key === 'groupOuting' ? 'group_outing' : m.key}` as TranslationKey)}
                </Text>
              </PressableScale>
            ))}
          </View>
        </Reveal>

        {/* ── Tous les univers, par catégorie, tous visibles ───────────── */}
        {UNIVERSE_CATEGORIES.map((cat, i) => (
          <CategorySection
            key={cat.key}
            cat={cat}
            index={i + 2}
            title={t(`category_${cat.key}` as TranslationKey)}
            labelOf={(u) => universeLabel(t, u)}
            onOpen={(u) => go(universeRoute(u))}
          />
        ))}
      </Animated.ScrollView>
      <FeatureTip feature="home" />
    </View>
  );
}

// ── Catégorie : titre en couleur + grille de tous ses univers ───────────────
// Tuiles sobres, comme à l'origine (17/11, demande de l'utilisateur : « trop
// de couleur ») ; seule la couleur de la catégorie reste, sur le titre.

function CategorySection({
  cat, index, title, labelOf, onOpen,
}: {
  cat: UniverseCategory;
  index: number;
  title: string;
  labelOf: (u: string) => string;
  onOpen: (u: string) => void;
}) {
  return (
    // Au-delà des premières catégories, plus de délai : elles apparaissent
    // hors écran, un retard ne ferait que ralentir le défilement.
    <Reveal index={Math.min(index, 5)} style={styles.section}>
      {/* En-tête façon éditorial de luxe : petites capitales espacées, filet
          fin qui file jusqu'au nombre d'univers. Aucune couleur. */}
      <View style={styles.catHead}>
        <Text style={styles.catTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.catRule} />
        <Text style={styles.catCount}>{String(cat.universes.length).padStart(2, '0')}</Text>
      </View>
      <View style={styles.universeGrid}>
        {cat.universes.map((u) => (
          <PressableScale key={u} style={styles.universeTile} onPress={() => onOpen(u)} scaleTo={0.92}>
            <UniverseGlyph u={u} size={26} />
            <Text style={styles.universeLabel} numberOfLines={2}>{labelOf(u)}</Text>
          </PressableScale>
        ))}
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },


  // En-tête
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  heroTop: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: 34 },
  weatherChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '70%',
    backgroundColor: 'rgba(0,0,0,0.30)', borderColor: 'rgba(255,255,255,0.22)', borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12,
  },
  weatherChipEmoji: { fontSize: 16 },
  weatherChipTemp: { color: '#fff', fontWeight: '800', fontSize: 15 },
  weatherChipCity: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 13, flexShrink: 1 },
  logoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroBottom: { gap: spacing.sm },
  greetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  // flexShrink borne le texte à la largeur restante après le badge, en LTR comme en RTL.
  greeting: {
    flexShrink: 1, minWidth: 0, color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.6, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 },
  },
  subGreeting: { ...typography.body, color: 'rgba(255,255,255,0.88)', textAlign: 'center', marginTop: -2 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm,
    backgroundColor: 'rgba(14,14,18,0.55)', borderColor: 'rgba(255,255,255,0.18)', borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 8, paddingLeft: spacing.md, paddingRight: 8,
  },
  searchIcon: { fontSize: 16 },
  searchText: { ...typography.body, color: 'rgba(255,255,255,0.75)', flex: 1 },
  searchGo: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  searchGoText: { color: '#fff', fontWeight: '900', fontSize: 16 },

  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },

  // Raccourcis
  shortcutsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shortcut: {
    width: '18.2%', alignItems: 'center', gap: 5, paddingVertical: 9,
    borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  shortcutIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  shortcutEmoji: { fontSize: 20 },
  shortcutLabel: { ...typography.label, color: colors.textSecondary, fontSize: 10 },
  badge: {
    position: 'absolute', top: 3, right: 4,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.surface,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Humeurs
  modesRow: { flexDirection: 'row', gap: 6 },
  modeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: colors.surfaceElevated, borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 6,
  },
  modeEmoji: { fontSize: 15 },
  modeLabel: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },

  // Catégories
  // Titre de catégorie : seul élément en couleur (couleur posée en ligne).
  catHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  catTitle: {
    color: colors.textPrimary, fontSize: 12, fontWeight: '700',
    letterSpacing: 2.4, textTransform: 'uppercase', flexShrink: 1,
  },
  catRule: { flex: 1, minWidth: 16, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.28)' },
  catCount: { color: colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, fontVariant: ['tabular-nums'] },
  universeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Tuile d'origine. Largeur en % : 4 colonnes quelle que soit la largeur
  // de l'écran (Android inclus).
  universeTile: {
    width: '22.5%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 3,
    gap: 3,
  },
  universeLabel: { ...typography.label, color: colors.textSecondary, textAlign: 'center', fontSize: 9, lineHeight: 12 },
});
