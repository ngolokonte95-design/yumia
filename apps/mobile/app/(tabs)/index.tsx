/**
 * HOME — « Que faire maintenant ? ». Point de départ de chaque session.
 *
 * Mise en scène (17/11/2026) :
 *  - en-tête = ciel réel de l'endroit où l'on est (WeatherSky), en parallaxe,
 *    avec la salutation en grand, la météo, la recherche et les humeurs ;
 *  - raccourcis en bulles façon « stories » ;
 *  - « Parfait maintenant » : 4 à 5 univers choisis selon l'heure et la météo,
 *    en grandes cartes colorées dont l'icône flotte ;
 *  - les 12 catégories en bannières dégradées qui s'ouvrent en accordéon sur
 *    leurs univers — plus de mur de 120 cases grises identiques.
 *
 * L'ancien écran (grille d'univers par catégorie) est dans l'historique git,
 * commit a2ced69 et antérieurs.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, Extrapolation, FadeIn, LinearTransition, cancelAnimation, interpolate,
  useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNIVERSE_META, UNIVERSE_CATEGORIES } from '@yumia/shared';
import type { Mode, UniverseCategory } from '@yumia/shared';
import {
  categoryGradients, colors, gradients, motion, radius, spacing, typography,
} from '../../theme/tokens';
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
import type { WeatherKind } from '../../lib/services/weather/types';
import { universeIcon } from '../../components/icons/universeIcons';
import { PressableScale, Reveal, GradientText } from '../../components/ui';
import { haptics } from '../../lib/useHaptics';
import { FeatureTip } from '../../components/FeatureTip';

type TFn = (key: TranslationKey) => string;

/** Hauteur du ciel, hors encoche. */
const HERO_HEIGHT = 330;

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
  { key: 'chatbot', emoji: '🤖', route: '/chatbot' },
  { key: 'surprise', emoji: '🎲', route: '/surprise' },
  { key: 'itinerary', emoji: '✨', route: '/itinerary' },
  { key: 'chat', emoji: '💬', route: '/chat' },
  { key: 'quests', emoji: '🎯', route: '/quests' },
  { key: 'shop', emoji: '🏬', route: '/shop' },
  { key: 'saved', emoji: '🔖', route: '/favorites' },
  { key: 'leaderboard', emoji: '🏆', route: '/leaderboard' },
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

/** Catégorie de chaque univers, pour lui donner la couleur de sa famille. */
const CATEGORY_OF: Record<string, string> = Object.fromEntries(
  UNIVERSE_CATEGORIES.flatMap((c) => c.universes.map((u) => [u, c.key] as const)),
);
function gradientOf(categoryKey: string | undefined): readonly [string, string] {
  return categoryGradients[categoryKey ?? 'other'] ?? categoryGradients.other;
}

function UniverseGlyph({ u, size }: { u: string; size: number }) {
  // Le registre partagé décide : un univers dessiné rend son icône, les
  // autres leur emoji.
  return universeIcon(u, size) ?? (
    <Text style={{ fontSize: size * 0.85 }}>{UNIVERSE_META[u as keyof typeof UNIVERSE_META]?.emoji ?? '📍'}</Text>
  );
}

// ── « Parfait maintenant » ───────────────────────────────────────────────────

const WET: ReadonlySet<WeatherKind> = new Set(['drizzle', 'rain', 'heavy_rain', 'thunderstorm']);

/**
 * Univers mis en avant selon l'heure locale et le temps qu'il fait. Règles
 * fixes et lisibles : la pluie l'emporte sur l'heure (on propose de
 * l'intérieur), puis le créneau de la journée.
 */
export function nowPicks(
  hour: number,
  kind: WeatherKind | undefined,
  tempC: number | undefined,
): { universes: string[]; reason: TranslationKey } {
  const wet = kind ? WET.has(kind) : false;
  if (kind === 'snow') return { universes: ['spa', 'cafe', 'cinema', 'museum', 'tea_house'], reason: 'home_now_reason_snow' };
  if (hour >= 23 || hour < 5) {
    return { universes: ['nightclub', 'bar', 'hookah', 'karaoke', 'pharmacy'], reason: 'home_now_reason_night' };
  }
  if (wet) return { universes: ['cinema', 'museum', 'bowling', 'escape_game', 'spa'], reason: 'home_now_reason_rain' };
  if (hour < 11) return { universes: ['bakery', 'cafe', 'brunch', 'park', 'juice_bar'], reason: 'home_now_reason_morning' };
  if (hour < 14) return { universes: ['restaurant', 'brunch', 'food_truck', 'picnic_area', 'cafe'], reason: 'home_now_reason_noon' };
  if (hour < 18) {
    if ((kind === 'clear' || kind === 'partly_cloudy') && (tempC ?? 0) >= 24) {
      return { universes: ['beach', 'ice_cream', 'aquatic', 'park', 'juice_bar'], reason: 'home_now_reason_hot' };
    }
    return { universes: ['museum', 'shopping', 'escape_game', 'ice_cream', 'park'], reason: 'home_now_reason_afternoon' };
  }
  return { universes: ['restaurant', 'rooftop', 'bar', 'live_music', 'comedy_club'], reason: 'home_now_reason_evening' };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { t } = useI18n();
  const { coords, city } = useLocation();

  // Le ciel et les icônes flottantes ne tournent que tant que l'onglet est
  // affiché (batterie).
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

  const now = nowPicks(new Date().getHours(), current?.kind, current?.tempC);

  // Une seule catégorie ouverte à la fois : l'écran reste lisible.
  const [openCat, setOpenCat] = useState<string | null>(null);
  const toggleCat = (key: string) => {
    haptics.select();
    setOpenCat((prev) => (prev === key ? null : key));
  };

  // ── Parallaxe du ciel ─────────────────────────────────────────────────────
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const heroTotal = HERO_HEIGHT + insets.top;
  const skyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-200, 0, heroTotal], [-100, 0, heroTotal * 0.45], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-200, 0], [1.35, 1], Extrapolation.CLAMP) },
    ],
  }));
  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, heroTotal * 0.6], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, heroTotal], [0, -30], Extrapolation.CLAMP) }],
  }));

  const go = (route: string) => router.push(route as never);

  return (
    <View style={styles.screen}>
      {/* ── Ciel réel, en fond, sous le défilement ─────────────────────── */}
      <Animated.View style={[styles.sky, { height: heroTotal + 90 }, skyStyle]} pointerEvents="none">
        {current && focused ? (
          <WeatherSky kind={current.kind} moment={moment} />
        ) : (
          <LinearGradient colors={gradients.brand} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(14,14,18,0.55)', colors.bg]}
          locations={[0.35, 0.78, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      >
        {/* ── En-tête sur le ciel ─────────────────────────────────────── */}
        <Animated.View style={[styles.hero, { height: heroTotal, paddingTop: insets.top + spacing.sm }, heroContentStyle]}>
          <View style={styles.heroTop}>
            <YumiaLogo height={44} />
            {current ? (
              <PressableScale style={styles.weatherChip} onPress={() => go('/weather')}>
                <Text style={styles.weatherChipEmoji}>{kindEmoji(current.kind, current.isDay)}</Text>
                <Text style={styles.weatherChipTemp}>{Math.round(current.tempC)}°</Text>
                {city ? <Text style={styles.weatherChipCity} numberOfLines={1}>{city}</Text> : null}
              </PressableScale>
            ) : null}
          </View>

          <View style={styles.heroBottom}>
            {/* Badge en rangée séparée (pas dans le flux du Text) : sinon il
                chevauche une lettre en arabe. */}
            <View style={styles.greetingRow}>
              <Text style={styles.greeting} numberOfLines={2}>{greetTitle}</Text>
              <PlanBadgeIcon plan={user?.plan} size={28} />
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

            {/* Humeurs — 4 pastilles qui se partagent toujours la largeur. */}
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
          </View>
        </Animated.View>

        {/* ── Raccourcis en bulles ────────────────────────────────────── */}
        <Reveal index={0}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesRow}>
            {FEATURE_SHORTCUTS.map((s) => (
              <PressableScale key={s.key} style={styles.story} onPress={() => go(s.route)} scaleTo={0.9}>
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.storyRing}>
                  <View style={styles.storyInner}>
                    <Text style={styles.storyEmoji}>{s.emoji}</Text>
                  </View>
                </LinearGradient>
                {s.key === 'chat' && unreadChats > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadChats > 9 ? '9+' : unreadChats}</Text>
                  </View>
                ) : null}
                <Text style={styles.storyLabel} numberOfLines={1}>{t(`home_shortcut_${s.key}` as TranslationKey)}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        </Reveal>

        {/* ── Parfait maintenant ──────────────────────────────────────── */}
        <Reveal index={1} style={styles.block}>
          <View style={styles.sectionHead}>
            <GradientText style={styles.sectionTitle}>{t('home_now_title')}</GradientText>
            <Text style={styles.sectionSub}>{t(now.reason)}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nowRow}>
            {now.universes.map((u, i) => (
              <NowCard
                key={u}
                u={u}
                index={i}
                focused={focused}
                label={universeLabel(t, u)}
                categoryLabel={CATEGORY_OF[u] ? t(`category_${CATEGORY_OF[u]}` as TranslationKey) : ''}
                onPress={() => go(universeRoute(u))}
              />
            ))}
          </ScrollView>
        </Reveal>

        {/* ── Tous les univers : bannières en accordéon ───────────────── */}
        <Reveal index={2} style={[styles.block, styles.padded]}>
          <Text style={styles.sectionTitlePlain}>{t('home_all_universes')}</Text>
          {UNIVERSE_CATEGORIES.map((cat, i) => (
            <CategoryBanner
              key={cat.key}
              cat={cat}
              index={i}
              open={openCat === cat.key}
              title={t(`category_${cat.key}` as TranslationKey)}
              count={t('home_universe_count').replace('{n}', String(cat.universes.length))}
              labelOf={(u) => universeLabel(t, u)}
              onToggle={() => toggleCat(cat.key)}
              onOpenUniverse={(u) => go(universeRoute(u))}
            />
          ))}
        </Reveal>
      </Animated.ScrollView>
      <FeatureTip feature="home" />
    </View>
  );
}

// ── Carte « Parfait maintenant » ─────────────────────────────────────────────

function NowCard({
  u, index, focused, label, categoryLabel, onPress,
}: {
  u: string;
  index: number;
  focused: boolean;
  label: string;
  categoryLabel: string;
  onPress: () => void;
}) {
  // L'icône flotte doucement, chaque carte décalée de la précédente : la
  // rangée « respire » au lieu de rester figée.
  const float = useSharedValue(0);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(float);
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    float.value = withDelay(
      index * 220,
      withRepeat(withSequence(withTiming(-7, { duration: 1700, easing: ease }), withTiming(0, { duration: 1700, easing: ease })), -1),
    );
    return () => cancelAnimation(float);
  }, [focused, index, float]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  const grad = gradientOf(CATEGORY_OF[u]);
  const emoji = UNIVERSE_META[u as keyof typeof UNIVERSE_META]?.emoji ?? '📍';

  return (
    <Reveal index={index} from="fade">
      <PressableScale style={styles.nowCard} onPress={onPress} scaleTo={0.95} haptic>
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
        <Text style={styles.nowGhost}>{emoji}</Text>
        <Animated.View style={[styles.nowIcon, iconStyle]}>
          <UniverseGlyph u={u} size={40} />
        </Animated.View>
        <View>
          <Text style={styles.nowLabel} numberOfLines={2}>{label}</Text>
          {categoryLabel ? <Text style={styles.nowCat} numberOfLines={1}>{categoryLabel}</Text> : null}
        </View>
      </PressableScale>
    </Reveal>
  );
}

// ── Bannière de catégorie ────────────────────────────────────────────────────

function CategoryBanner({
  cat, index, open, title, count, labelOf, onToggle, onOpenUniverse,
}: {
  cat: UniverseCategory;
  index: number;
  open: boolean;
  title: string;
  count: string;
  labelOf: (u: string) => string;
  onToggle: () => void;
  onOpenUniverse: (u: string) => void;
}) {
  const grad = gradientOf(cat.key);

  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, { duration: motion.duration.fast });
  }, [open, turn]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));

  return (
    <Animated.View layout={LinearTransition.duration(motion.duration.normal)} style={styles.catWrap}>
      <Reveal index={index} from="fade">
        <PressableScale style={styles.catBanner} onPress={onToggle} scaleTo={0.98}>
          <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
          <Text style={styles.catGhost}>{cat.emoji}</Text>
          <View style={styles.catText}>
            <Text style={styles.catTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.catCount}>{count}</Text>
            <View style={styles.catPreview}>
              {cat.universes.slice(0, 5).map((u) => (
                <View key={u} style={styles.catPreviewDot}>
                  <UniverseGlyph u={u} size={16} />
                </View>
              ))}
            </View>
          </View>
          <Animated.View style={[styles.chevron, chevronStyle]}>
            <Text style={styles.chevronText}>⌄</Text>
          </Animated.View>
        </PressableScale>
      </Reveal>

      {open ? (
        <View style={styles.universeGrid}>
          {cat.universes.map((u, i) => (
            <Animated.View key={u} entering={FadeIn.duration(motion.duration.fast).delay(i * 28)} style={styles.universeCell}>
              <PressableScale style={[styles.universeTile, { borderColor: `${grad[1]}66` }]} onPress={() => onOpenUniverse(u)}>
                <LinearGradient colors={[`${grad[1]}38`, `${grad[0]}10`]} style={StyleSheet.absoluteFill} />
                <UniverseGlyph u={u} size={28} />
                <Text style={styles.universeLabel} numberOfLines={2}>{labelOf(u)}</Text>
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  sky: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },

  // En-tête
  hero: { paddingHorizontal: spacing.lg, justifyContent: 'space-between', paddingBottom: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weatherChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '60%',
    backgroundColor: 'rgba(0,0,0,0.30)', borderColor: 'rgba(255,255,255,0.22)', borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12,
  },
  weatherChipEmoji: { fontSize: 16 },
  weatherChipTemp: { color: '#fff', fontWeight: '800', fontSize: 15 },
  weatherChipCity: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 13, flexShrink: 1 },
  heroBottom: { gap: spacing.sm },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // flex:1 borne le texte à la largeur restante après le badge, en LTR comme en RTL.
  greeting: {
    flex: 1, minWidth: 0, color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -0.8,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 },
  },
  subGreeting: { ...typography.body, color: 'rgba(255,255,255,0.88)', marginTop: -2 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs,
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
  modesRow: { flexDirection: 'row', gap: 6 },
  modeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.22)', borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 6,
  },
  modeEmoji: { fontSize: 15 },
  modeLabel: { ...typography.caption, color: '#fff', fontWeight: '700' },

  // Raccourcis en bulles
  storiesRow: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  story: { width: 68, alignItems: 'center', gap: 6 },
  storyRing: { width: 66, height: 66, borderRadius: 33, padding: 2.5 },
  storyInner: {
    flex: 1, borderRadius: 31, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg,
  },
  storyEmoji: { fontSize: 26 },
  storyLabel: { ...typography.label, color: colors.textSecondary, fontSize: 11 },
  badge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Sections
  block: { marginBottom: spacing.xl },
  padded: { paddingHorizontal: spacing.lg },
  sectionHead: { paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: 4 },
  sectionTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  sectionTitlePlain: { fontSize: 22, fontWeight: '900', color: colors.textPrimary, letterSpacing: -0.4, marginBottom: spacing.md },
  sectionSub: { ...typography.caption, color: colors.textSecondary },

  // Parfait maintenant
  nowRow: { paddingHorizontal: spacing.lg, gap: spacing.md },
  nowCard: {
    width: 152, height: 196, borderRadius: radius.lg, overflow: 'hidden',
    padding: spacing.md, justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)',
  },
  nowGhost: { position: 'absolute', right: -18, bottom: 30, fontSize: 96, opacity: 0.22 },
  nowIcon: {
    width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.30)', borderWidth: 1,
  },
  nowLabel: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  nowCat: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  // Catégories
  catWrap: { marginBottom: spacing.sm },
  catBanner: {
    height: 104, borderRadius: radius.lg, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.20)',
  },
  catGhost: { position: 'absolute', right: 36, top: -6, fontSize: 92, opacity: 0.25 },
  catText: { flex: 1, gap: 2 },
  catTitle: { color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  catCount: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600' },
  catPreview: { flexDirection: 'row', gap: 5, marginTop: 6 },
  catPreviewDot: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)', borderColor: 'rgba(255,255,255,0.25)', borderWidth: StyleSheet.hairlineWidth,
  },
  chevron: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  chevronText: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: -6 },
  universeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.sm },
  // Pourcentages : 4 colonnes quelle que soit la largeur (Android inclus).
  universeCell: { width: '22.8%' },
  universeTile: {
    aspectRatio: 0.9, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 3,
  },
  universeLabel: { ...typography.label, color: colors.textPrimary, textAlign: 'center', fontSize: 10, lineHeight: 12 },
});
