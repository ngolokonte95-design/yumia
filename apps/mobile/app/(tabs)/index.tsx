/**
 * HOME — « Que faire maintenant ? ». Point de départ de chaque session.
 *
 * 17/11/2026, deuxième version (demande de l'utilisateur après essai) : retour
 * à la disposition d'origine — logo au centre, raccourcis, humeurs, puis TOUS
 * les univers visibles par catégorie, accessibles en un toucher — mais en
 * beaucoup plus soigné :
 *  - fond = espace profond sur TOUT l'écran (SpaceBackground) : noir spatial,
 *    étoiles qui scintillent, étoiles filantes, système solaire animé ; aucun
 *    dégradé linéaire (ils dessinaient une barre grise) ;
 *  - logo en grand au centre, salutation et recherche par-dessus ;
 *  - raccourcis en tuiles à pastille dégradée ;
 *  - univers : tuiles d'origine, sobres ; en-tête de catégorie = médaillon
 *    et titre au dégradé de marque (le même partout) + filet dégradé.
 * « Parfait maintenant » et l'accordéon de catégories ont été retirés.
 */
import { useCallback, useState } from 'react';
import { I18nManager, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion,
  useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UNIVERSE_CATEGORIES } from '@yumia/shared';
import type { Mode, UniverseCategory } from '@yumia/shared';
import { colors, elevation, gradients, motion, radius, spacing, typography } from '../../theme/tokens';
import { UniverseGlyph } from '../../components/UniverseGlyph';
import { YumiaLogo } from '../../components/YumiaLogo';
import { PlanBadgeIcon } from '../../components/Avatar';
import { universeLabel } from '../../lib/universeMeta';
import { useLocation } from '../../lib/useLocation';
import { useAuth } from '../../lib/auth-context';
import { request } from '../../lib/api';
import { useI18n } from '../../lib/useI18n';
import type { TranslationKey } from '../../lib/translations';
import { SpaceBackground, SPACE_BLACK } from '../../components/space/SpaceBackground';
import { WeatherCard } from '../../components/weather/WeatherCard';
import { CrystalFill, GradientText, PressableScale, Reveal } from '../../components/ui';
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

  // Tirer pour rafraîchir : le compteur de messages non lus (même requête
  // que ci-dessus) et la barre météo. Celle-ci porte son propre chargement :
  // on la remonte, elle relit son cache et ne rappelle le réseau que si sa
  // donnée a plus de 15 min — sa règle habituelle, inchangée.
  const [refreshing, setRefreshing] = useState(false);
  const [weatherKey, setWeatherKey] = useState(0);
  // Hauteur gardée pendant le remontage de la barre : le logo ne saute pas.
  const [weatherHeight, setWeatherHeight] = useState(0);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setWeatherKey((k) => k + 1);
      if (accessToken) {
        const r = await request<{ count: number }>('/chat/unread-count', { token: accessToken });
        setUnreadChats(r.count);
      }
    } catch {
      // Hors ligne : on garde ce qui est affiché.
    } finally {
      setRefreshing(false);
    }
  }, [accessToken]);

  const { title: greetTitle, sub: greetSub } = buildGreeting(user?.displayName ?? 'toi', t);

  // ── En-tête qui s'efface au défilement ─────────────────────────────────────────────────────
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
      {/* ── Espace profond en fond de TOUT l'écran, fixe ──────────────────
          (17/11, demande de l'utilisateur : « un vrai système solaire »). */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <SpaceBackground active={focused} />
      </View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor="#fff"
            colors={[colors.brand]}
            progressViewOffset={insets.top}
          />
        }
      >
        {/* ── En-tête sur le ciel ─────────────────────────────────────── */}
        <Animated.View style={[styles.hero, { minHeight: heroTotal, paddingTop: insets.top + spacing.sm }, heroContentStyle]}>
          {/* Barre météo d'origine, tout en haut (préférée par l'utilisateur
              à la pastille compacte, 17/11) — ouvre l'écran Météo. */}
          <View style={weatherHeight ? { minHeight: weatherHeight } : undefined}>
            <View
              onLayout={(e) => {
                const h = Math.round(e.nativeEvent.layout.height);
                if (h > 0 && h !== weatherHeight) setWeatherHeight(h);
              }}
            >
              <WeatherCard key={weatherKey} lat={coords.lat} lng={coords.lng} />
            </View>
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
              {/* 18/11 : plus d'aplat orange — pastille sertie de cristal, flèche
                  en blanc cristal (même matière que les titres). */}
              <View style={styles.searchGo}>
                <CrystalFill edge={1.3} core="#121219" />
                <GradientText style={styles.searchGoText} colors={gradients.crystal}>
                  {I18nManager.isRTL ? '←' : '→'}
                </GradientText>
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
                  {s.key === 'chat' ? (
                    // Messages ET appels passent par cet écran : deux icônes.
                    <View style={styles.shortcutPair}>
                      <Text style={styles.shortcutEmojiSmall}>📞</Text>
                      <Text style={styles.shortcutEmojiSmall}>{s.emoji}</Text>
                    </View>
                  ) : (
                    <Text style={styles.shortcutEmoji}>{s.emoji}</Text>
                  )}
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
            count={t('home_universe_count').replace('{n}', String(cat.universes.length))}
            labelOf={(u) => universeLabel(t, u)}
            onOpen={(u) => go(universeRoute(u))}
          />
        ))}
      </Animated.ScrollView>
      <FeatureTip feature="home" />
    </View>
  );
}

// ── Catégorie : en-tête au dégradé de marque + grille de tous ses univers ───
// Tuiles sobres, comme à l'origine (17/11, demande de l'utilisateur : « trop
// de couleur », puis « de la couleur, mais pas différente partout »).

function CategorySection({
  cat, index, title, count, labelOf, onOpen,
}: {
  cat: UniverseCategory;
  index: number;
  title: string;
  /** « 12 univers ». */
  count: string;
  labelOf: (u: string) => string;
  onOpen: (u: string) => void;
}) {
  return (
    // Au-delà des premières catégories, plus de délai : elles apparaissent
    // hors écran, un retard ne ferait que ralentir le défilement.
    <Reveal index={Math.min(index, 5)} style={styles.section}>
      {/* En-tête : médaillon et titre au dégradé de MARQUE (orange → violet),
          le même pour toutes les catégories — de la couleur, mais une seule
          (17/11, demande de l'utilisateur). Filet dégradé qui s'efface. */}
      <View style={styles.catHead}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.catMedal}>
          <Text style={styles.catMedalEmoji}>{cat.emoji}</Text>
        </LinearGradient>
        <View style={styles.catText}>
          {/* Titre en blanc cristal (18/11, demande de l'utilisateur). */}
          <GradientText style={styles.catTitle} colors={gradients.crystal}>{title}</GradientText>
          <Text style={styles.catCount}>{count}</Text>
        </View>
      </View>
      <LinearGradient
        colors={[colors.brand, `${colors.accent}66`, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.catRule}
      />
      <View style={styles.universeGrid}>
        {cat.universes.map((u) => (
          <UniverseTile key={u} u={u} label={labelOf(u)} onPress={() => onOpen(u)} />
        ))}
      </View>
    </Reveal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Tuile d'univers en verre taillé (18/11, demande de l'utilisateur).
 *
 * Au repos : verre sombre et liseré cristal très atténué, plus clair sur
 * l'arête du haut et qui s'efface vers le bas (couleur par côté : aucun
 * calque opaque, le fond spatial reste visible à travers). Au toucher, le
 * liseré s'illumine en plein cristal avec un reflet, puis s'éteint en douceur.
 * Le cristal fort reste réservé à ce qui est choisi ou touché : au repos,
 * des dizaines de tuiles brillantes ne ressortiraient plus.
 */
function UniverseTile({ u, label, onPress }: { u: string; label: string; onPress: () => void }) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : withSpring(1 - pressed.value * 0.08, motion.spring.snappy) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: withTiming(pressed.value, { duration: pressed.value ? 90 : 380 }),
  }));

  return (
    <AnimatedPressable
      onPressIn={() => { pressed.value = 1; }}
      onPressOut={() => { pressed.value = 0; }}
      onPress={onPress}
      style={[styles.universeTile, pressStyle]}
    >
      <Animated.View pointerEvents="none" style={[styles.tileLit, glowStyle]}>
        <LinearGradient colors={TILE_SHEEN} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <UniverseGlyph u={u} size={26} />
      <Text style={styles.universeLabel} numberOfLines={2}>{label}</Text>
    </AnimatedPressable>
  );
}

/** Reflet de la tuile touchée : éclat blanc en haut à gauche qui s'efface. */
const TILE_SHEEN = ['rgba(255,255,255,0.16)', 'rgba(220,228,240,0.05)', 'rgba(255,255,255,0)'] as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SPACE_BLACK },


  // En-tête
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  logoWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
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
    width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  searchGoText: { color: '#fff', fontWeight: '900', fontSize: 17, marginTop: -1 },

  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },

  // Raccourcis
  // Toujours 2 lignes de 5, quelle que soit la largeur : 5 × 18,4 % = 92 %,
  // les 8 % restants deviennent les espaces (space-between). Un `gap` fixe en
  // pixels s'ajoutait aux pourcentages et faisait passer la 5ᵉ tuile à la
  // ligne sur les Android étroits (4 + 4 + 2).
  shortcutsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
  shortcut: {
    width: '18.4%', alignItems: 'center', gap: 5, paddingVertical: 9,
    borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  shortcutIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  shortcutEmoji: { fontSize: 20 },
  shortcutPair: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  shortcutEmojiSmall: { fontSize: 14 },
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

  // Catégories — une seule couleur, celle de la marque.
  catHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  catMedal: {
    width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)',
    ...elevation.glowBrand,
  },
  catMedalEmoji: { fontSize: 22 },
  catText: { flex: 1, gap: 1 },
  catTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  catCount: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  catRule: { height: 2, borderRadius: 1, marginTop: spacing.sm, marginBottom: spacing.md },
  universeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Tuile d'origine. Largeur en % : 4 colonnes quelle que soit la largeur
  // de l'écran (Android inclus).
  universeTile: {
    width: '22.5%',
    backgroundColor: 'rgba(28,28,40,0.58)',
    // Liseré cristal atténué : la lumière vient d'en haut à gauche.
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.26)',
    borderLeftColor: 'rgba(220,228,240,0.16)',
    borderRightColor: 'rgba(174,187,208,0.09)',
    borderBottomColor: 'rgba(174,187,208,0.05)',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 3,
    gap: 3,
  },
  // Liseré plein cristal + reflet, allumés au toucher.
  tileLit: {
    position: 'absolute', top: -1, left: -1, right: -1, bottom: -1,
    borderRadius: radius.md, overflow: 'hidden', borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.95)',
    borderLeftColor: 'rgba(255,255,255,0.80)',
    borderRightColor: 'rgba(174,187,208,0.55)',
    borderBottomColor: 'rgba(174,187,208,0.40)',
  },
  universeLabel: { ...typography.label, color: colors.textSecondary, textAlign: 'center', fontSize: 9, lineHeight: 12 },
});
