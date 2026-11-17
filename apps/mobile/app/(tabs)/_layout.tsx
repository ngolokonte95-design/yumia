import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevation, gradients, motion } from '../../theme/tokens';
import { useUnreadNotificationsCount } from '../../lib/useNotifications';
import { useI18n } from '../../lib/useI18n';
import { haptics } from '../../lib/useHaptics';
import { TrialNotice } from '../../components/TrialNotice';

const SOCIAL_TAB_ICON = require('../../assets/social-tab-icon.png');

const TAB_BAR_BASE_HEIGHT = 58;
// Marge supplémentaire (Android) pour remonter un peu plus la barre au-dessus
// de la zone de gestes système, en plus de l'inset de sécurité.
const TAB_BAR_EXTRA_BOTTOM_ANDROID = 12;

/**
 * Navigation principale — barre inférieure (section 5 du PRD).
 *
 * Mise en scène (17/11/2026) : une seule couleur, celle de la marque.
 *  - fond très sombre, surmonté d'un filet lumineux orange → violet ;
 *  - l'onglet actif se pose sur une pastille au dégradé de marque, avec un
 *    halo, et l'icône grandit et se soulève d'un ressort ;
 *  - les onglets inactifs restent discrets (estompés) ;
 *  - léger retour haptique à chaque changement d'onglet.
 * La barre reste dans le flux (pas flottante) : les écrans gardent leur
 * hauteur visible exacte (« Pour toi » s'y cale).
 */
function TabBadge({ count }: { count: number }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

/** Pastille dégradée + ressort : commune à tous les onglets. */
function TabIconFrame({ focused, children, badge }: { focused: boolean; children: React.ReactNode; badge?: number }) {
  const active = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, motion.spring.bouncy);
  }, [focused, active]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scaleX: 0.55 + active.value * 0.45 }, { scaleY: 0.75 + active.value * 0.25 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + active.value * 0.5,
    transform: [{ translateY: -2 * active.value }, { scale: 1 + active.value * 0.1 }],
  }));

  return (
    <View style={styles.iconBox}>
      <Animated.View style={[styles.pill, pillStyle]}>
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {/* Reflet en haut de la pastille : effet bijou plutôt qu'aplat. */}
        <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={iconStyle}>{children}</Animated.View>
      {badge && badge > 0 ? <TabBadge count={badge} /> : null}
    </View>
  );
}

function TabIcon({ emoji, focused, badge }: { emoji: string; focused: boolean; badge?: number }) {
  return (
    <TabIconFrame focused={focused} badge={badge}>
      <Text style={styles.emoji}>{emoji}</Text>
    </TabIconFrame>
  );
}

/** Icône du tab "Social" : le pictogramme YUMIA (sans le mot-symbole), pour
 * distinguer ce tab des emoji utilisés partout ailleurs. */
function SocialTabIcon({ focused }: { focused: boolean }) {
  return (
    <TabIconFrame focused={focused}>
      <Image
        source={SOCIAL_TAB_ICON}
        style={{ width: 20, height: 20 * (431 / 361) }}
        contentFit="contain"
      />
    </TabIconFrame>
  );
}

/** Fond de la barre : noir profond + filet lumineux au dégradé de marque. */
function TabBarBackground() {
  return (
    <View style={styles.barBg}>
      <LinearGradient
        colors={['transparent', colors.brand, colors.accent, 'transparent']}
        locations={[0, 0.3, 0.7, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.barGlowLine}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useI18n();
  const unreadCount = useUnreadNotificationsCount();
  const insets = useSafeAreaInsets();

  return (
    <>
    <Tabs
      screenListeners={{ tabPress: () => haptics.select() }}
      screenOptions={{
        headerShown: false,
        // Fond du conteneur des onglets, visible un instant au changement
        // d'onglet et derrière un écran qui se ferme (voir navTheme dans
        // app/_layout.tsx pour le même flash blanc côté pile).
        sceneStyle: { backgroundColor: colors.bg },
        tabBarShowLabel: true,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopWidth: 0,
          paddingTop: 8,
          // Avec 7 onglets répartis à parts égales, Home et Profil se
          // retrouvaient collés aux bords de l'écran (les onglets du milieu ont
          // un voisin de chaque côté qui leur donne de l'air, pas les deux du
          // bord). Cette marge leur redonne le même espace de respiration.
          paddingHorizontal: 14,
          // Android uniquement : en mode edge-to-edge, la zone de gestes/barre
          // système du bas peut chevaucher la tab bar si l'inset n'est pas
          // ajouté explicitement — les icônes apparaissent alors à moitié
          // masquées. iOS gère déjà le home indicator automatiquement.
          ...(Platform.OS === 'android'
            ? {
                height: TAB_BAR_BASE_HEIGHT + insets.bottom + TAB_BAR_EXTRA_BOTTOM_ANDROID,
                paddingBottom: insets.bottom + TAB_BAR_EXTRA_BOTTOM_ANDROID,
              }
            : {}),
        },
        tabBarActiveTintColor: colors.brandSoft,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tab_home'), tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: t('tab_map'), tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} /> }}
      />
      <Tabs.Screen
        name="explorer"
        options={{ title: t('tab_explorer'), tabBarIcon: ({ focused }) => <TabIcon emoji="🧭" focused={focused} /> }}
      />
      <Tabs.Screen
        name="social"
        options={{ title: t('tab_social'), tabBarIcon: ({ focused }) => <SocialTabIcon focused={focused} /> }}
      />
      <Tabs.Screen
        name="foryou"
        options={{ title: t('tab_foryou'), tabBarIcon: ({ focused }) => <TabIcon emoji="✨" focused={focused} /> }}
      />
      <Tabs.Screen
        name="passport"
        options={{ title: t('tab_passport'), tabBarIcon: ({ focused }) => <TabIcon emoji="🎒" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab_profile'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} badge={unreadCount} />,
        }}
      />
    </Tabs>
    {/* Essai Gold offert : accueil, rappels des derniers jours, fin. */}
    <TrialNotice />
    </>
  );
}

const styles = StyleSheet.create({
  barBg: { flex: 1, backgroundColor: colors.bg },
  barGlowLine: { height: StyleSheet.hairlineWidth * 2, opacity: 0.9 },
  iconBox: { width: 46, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 16,
    overflow: 'hidden',
    ...elevation.glowBrand,
  },
  emoji: { fontSize: 20 },
  label: { fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: 2,
    backgroundColor: colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  badgeText: { fontSize: 9, color: '#fff', fontWeight: '800' },
});
