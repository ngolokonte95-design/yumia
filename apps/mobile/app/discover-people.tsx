/**
 * TIND — découverte de personnes à proximité, en paquet de cartes à glisser.
 *
 * Mise en scène (17/11/2026) : grandes cartes profil, photo plein cadre,
 * infos posées sur la photo (voile confiné à la carte), boutons ronds en verre
 * et cœur au dégradé de marque. Pas de pastille de compatibilité : l'API ne
 * renvoie pas cette donnée, on n'en invente pas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, PanResponder,
  StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, elevation, gradients, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import type { Plan } from '../lib/feed-api';
import { PlanBadgeIcon } from '../components/Avatar';
import { useI18n } from '../lib/useI18n';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import type { TranslationKey } from '../lib/translations';
import { FeatureTip } from '../components/FeatureTip';
import { AdultsOnlyNotice } from '../components/AdultsOnlyNotice';
import { isAdultYear } from '../lib/dating-age';
import { PressableScale, Reveal } from '../components/ui';
import { haptics } from '../lib/useHaptics';
import {
  BrandChip, GlassIconButton, OutlineButton, SocialEmpty, SocialHeader,
} from '../components/social/SocialChrome';

const API = API_BASE_URL;

interface Profile {
  id: string;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  level: number;
  totalXp: number;
  distanceKm?: number;
  gender?: string | null;
  birthYear?: number | null;
  plan?: Plan | null;
}

const SWIPE_THRESHOLD = 100;

const FILTERS: { value: 'everyone' | 'female' | 'male'; labelKey: TranslationKey }[] = [
  { value: 'everyone', labelKey: 'dp_filter_everyone' },
  { value: 'female', labelKey: 'dp_filter_female' },
  { value: 'male', labelKey: 'dp_filter_male' },
];

type FilterValue = 'everyone' | 'female' | 'male';

export default function DiscoverPeopleScreen() {
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const adult = isAdultYear(user?.birthYear);
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [filter, setFilter] = useState<FilterValue>('everyone');
  const pan = useRef(new Animated.ValueXY()).current;
  // Position mémorisée pour la durée de l'écran : sans ça, chaque changement
  // de filtre relançait une acquisition GPS complète (plusieurs secondes
  // d'attente), alors que la position n'a évidemment pas bougé entre deux
  // clics sur « Homme » / « Femme ».
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [upsell, setUpsell] = useState<string | null>(null);
  const { checkLimit, recordUsage, remaining, quotaMessage } = usePlanLimits();

  // Carte aussi grande que l'écran le permet (en-tête, filtres et boutons
  // retirés), plafonnée pour rester élégante sur tablette.
  const cardW = Math.min(screenW - spacing.md * 2, 460);
  const cardH = Math.min(Math.max(screenH - insets.top - insets.bottom - 300, 380), 640);

  const load = useCallback(async (interestedIn: FilterValue = 'everyone') => {
    if (!accessToken) return;
    setLoading(true);
    try {
      let url = `${API}/discover/swipe?limit=15&interestedIn=${interestedIn}`;

      if (!coordsRef.current) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          // Dernière position connue d'abord : quasi instantanée, et
          // largement assez précise pour un rayon de recherche de 50 km.
          const last = await Location.getLastKnownPositionAsync();
          const loc = last ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coordsRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      }

      if (coordsRef.current) {
        url += `&lat=${coordsRef.current.lat}&lng=${coordsRef.current.lng}`;
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const data = await res.json();
        const list: Profile[] = Array.isArray(data) ? data : [];
        // Le quota porte sur les PROFILS VUS, pas sur les chargements : on ne
        // présente que ce qu'il reste à voir aujourd'hui. Charger quinze
        // profils pour en montrer trois donnerait un paquet qui s'arrête sans
        // raison visible.
        const left = await remaining('peopleSuggestionsPerDay');
        setProfiles(left === Infinity ? list : list.slice(0, left));
        setIdx(0);
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, remaining]);

  useEffect(() => { void load(filter); }, [load, filter]);

  const markSeen = async (userId: string) => {
    // Un profil vu consomme le quota, qu'il soit accepté ou passé.
    await recordUsage('peopleSuggestionsPerDay');
    const { allowed } = await checkLimit('peopleSuggestionsPerDay');
    if (!allowed) setUpsell(quotaMessage('peopleSuggestionsPerDay', t('social_menu_tind')));
    await fetch(`${API}/discover/swipe/${userId}/seen`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
    });
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      const current = profiles[idx];
      if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
        haptics.light();
        Animated.timing(pan, { toValue: { x: gesture.dx > 0 ? 500 : -500, y: gesture.dy }, duration: 200, useNativeDriver: false }).start(() => {
          if (current) {
            // À droite, le badge dit « J'aime » : c'est le même geste que ❤️,
            // qui abonne à la personne. Il se contentait de passer le profil.
            if (gesture.dx > 0) {
              void fetch(`${API}/social/follow/${current.id}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
            }
            void markSeen(current.id);
          }
          pan.setValue({ x: 0, y: 0 });
          setIdx((i) => i + 1);
        });
      } else {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      }
    },
  });

  const rotate = pan.x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-10deg', '0deg', '10deg'] });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1] });
  const passOpacity = pan.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0] });
  // La carte suivante grandit à mesure que la première s'en va.
  const nextScale = pan.x.interpolate({ inputRange: [-200, 0, 200], outputRange: [1, 0.94, 1], extrapolate: 'clamp' });

  const current = profiles[idx];
  const next = profiles[idx + 1];

  const header = <SocialHeader title={t('dp_title')} onBack={() => router.back()} />;

  // Tind est réservé aux majeurs (le serveur refuse aussi, cf. DiscoverService).
  if (!adult) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <AdultsOnlyNotice birthYearMissing={user?.birthYear == null} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  const pass = () => {
    if (!current) return;
    haptics.select();
    void markSeen(current.id);
    setIdx((i) => i + 1);
    pan.setValue({ x: 0, y: 0 });
  };

  const like = async () => {
    if (!current) return;
    haptics.success();
    await fetch(`${API}/social/follow/${current.id}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    await markSeen(current.id);
    setIdx((i) => i + 1);
    pan.setValue({ x: 0, y: 0 });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />
      {header}

      {/* Filtre de genre */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <BrandChip
            key={f.value}
            label={t(f.labelKey)}
            active={filter === f.value}
            onPress={() => { haptics.select(); setFilter(f.value); }}
          />
        ))}
      </View>

      {!current ? (
        /* Distingue « tu as tout vu » (🎉) de « ce filtre ne renvoie rien » :
           le genre est optionnel et rarement renseigné, donc filtrer dessus
           donne souvent zéro résultat — afficher 🎉 laissait croire à tort
           qu'on avait parcouru tous les profils. */
        filter !== 'everyone' ? (
          <SocialEmpty
            emoji="🔍"
            title={t('dp_empty_filtered_title')}
            text={t('dp_empty_filtered_text')}
            action={<OutlineButton label={t('dp_filter_everyone')} onPress={() => { setFilter('everyone'); void load('everyone'); }} />}
          />
        ) : (
          <SocialEmpty
            emoji="🎉"
            title={t('dp_empty_title')}
            text={t('dp_empty_text')}
            action={<OutlineButton label={t('dp_reload')} onPress={() => load(filter)} />}
          />
        )
      ) : (
        <View style={styles.deck}>
          {/* Carte suivante, derrière */}
          {next && (
            <Animated.View style={[styles.card, { width: cardW, height: cardH, transform: [{ scale: nextScale }], opacity: 0.85 }]}>
              <ProfileCard profile={next} />
            </Animated.View>
          )}

          {/* Carte courante, à glisser */}
          <Animated.View
            {...panResponder.panHandlers}
            style={[styles.card, styles.cardFront, { width: cardW, height: cardH, transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
          >
            <ProfileCard profile={current} />
            {/* Tampons « J'aime » / « Passer » */}
            <Animated.View style={[styles.stamp, styles.stampLike, { opacity: likeOpacity }]}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.stampText}>{t('dp_like_badge')}</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.stampPass, { opacity: passOpacity }]}>
              <Text style={styles.stampText}>{t('dp_pass_badge')}</Text>
            </Animated.View>
          </Animated.View>
        </View>
      )}

      {/* Actions */}
      {current && (
        <Reveal index={1} style={[styles.buttons, { paddingBottom: insets.bottom + spacing.md }]}>
          <GlassIconButton icon="👋" size={64} onPress={pass} style={styles.roundShadow} />
          <PressableScale style={styles.profileBtn} onPress={() => router.push(`/user/${current.id}`)} scaleTo={0.95}>
            <Text style={styles.profileBtnText} numberOfLines={1}>{t('dp_see_profile')}</Text>
          </PressableScale>
          <PressableScale style={styles.likeBtn} onPress={() => void like()} scaleTo={0.88}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
            <Text style={styles.likeIcon}>❤️</Text>
          </PressableScale>
        </Reveal>
      )}
      <FeatureTip feature="tind" />
    </View>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const age = profile.birthYear ? new Date().getFullYear() - profile.birthYear : null;
  const gender = profile.gender
    ? profile.gender === 'male' ? t('dp_gender_male') : profile.gender === 'female' ? t('dp_gender_female') : t('dp_gender_other')
    : null;
  const distance = profile.distanceKm !== undefined
    ? profile.distanceKm < 1 ? `${Math.round(profile.distanceKm * 1000)} m` : `${profile.distanceKm} km`
    : null;

  return (
    <View style={StyleSheet.absoluteFill}>
      {profile.photoUrl ? (
        <Image source={{ uri: profile.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, cardStyles.initialBox]}>
          <Text style={cardStyles.initial}>{profile.displayName[0]}</Text>
        </LinearGradient>
      )}

      {/* Voile de lecture, confiné à la carte (bas de la photo seulement). */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']}
        locations={[0.35, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Niveau, en haut, en verre. */}
      <View style={cardStyles.topRow}>
        <View style={cardStyles.glassPill}>
          <Text style={cardStyles.glassPillText}>⚡ {t('dp_level_short')} {profile.level}</Text>
        </View>
        {distance ? (
          <View style={cardStyles.glassPill}>
            <Text style={cardStyles.glassPillText}>📍 {distance}</Text>
          </View>
        ) : null}
      </View>

      <View style={cardStyles.info}>
        <View style={cardStyles.nameRow}>
          <Text style={cardStyles.name} numberOfLines={1}>
            {profile.displayName}{age !== null ? <Text style={cardStyles.age}>{`, ${age}`}</Text> : null}
          </Text>
          <PlanBadgeIcon plan={profile.plan} size={30} />
        </View>
        {gender ? <Text style={cardStyles.meta}>{gender}</Text> : null}
        {profile.bio ? <Text style={cardStyles.bio} numberOfLines={3}>{profile.bio}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  deck: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute', borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  cardFront: { ...elevation.high },
  stamp: {
    position: 'absolute', top: 54, zIndex: 10, overflow: 'hidden',
    borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 8,
    borderWidth: 2, borderColor: '#fff',
  },
  stampLike: { left: 18, transform: [{ rotate: '-14deg' }] },
  stampPass: { right: 18, transform: [{ rotate: '14deg' }], backgroundColor: 'rgba(14,14,18,0.7)' },
  stampText: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: 1.5, textTransform: 'uppercase' },
  buttons: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md,
    paddingTop: spacing.md, paddingHorizontal: spacing.md,
  },
  roundShadow: { ...elevation.medium },
  profileBtn: {
    flex: 1, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(31,31,42,0.72)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
  },
  profileBtnText: { color: colors.textPrimary, fontWeight: '800', fontSize: 15 },
  likeBtn: {
    width: 68, height: 68, borderRadius: 34, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', ...elevation.glowBrand,
  },
  likeIcon: { fontSize: 28 },
});

const cardStyles = StyleSheet.create({
  initialBox: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontSize: 110, fontWeight: '900', opacity: 0.9 },
  topRow: {
    position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  glassPill: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill,
    backgroundColor: 'rgba(14,14,18,0.55)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  glassPillText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: {
    flexShrink: 1, color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -0.8,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 },
  },
  age: { fontWeight: '500', fontSize: 30 },
  meta: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700' },
  bio: { color: 'rgba(255,255,255,0.92)', fontSize: 15, lineHeight: 21 },
});
