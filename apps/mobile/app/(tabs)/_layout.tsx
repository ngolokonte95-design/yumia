import { Tabs } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';
import { useUnreadNotificationsCount } from '../../lib/useNotifications';

const SOCIAL_TAB_ICON = require('../../assets/social-tab-icon.png');

const TAB_BAR_BASE_HEIGHT = 56;
// Marge supplémentaire (Android) pour remonter un peu plus la barre au-dessus
// de la zone de gestes système, en plus de l'inset de sécurité.
const TAB_BAR_EXTRA_BOTTOM_ANDROID = 12;

/**
 * Navigation principale — barre inférieure à 5 onglets (section 5 du PRD).
 * Chaque onglet répond à un état émotionnel différent de l'utilisateur.
 */
function TabIcon({ emoji, focused, badge }: { emoji: string; focused: boolean; badge?: number }) {
  return (
    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 26, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
      {badge && badge > 0 ? (
        <View style={{
          position: 'absolute',
          top: -2,
          right: -4,
          backgroundColor: colors.danger,
          borderRadius: 8,
          minWidth: 14,
          height: 14,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 2,
        }}>
          <Text style={{ fontSize: 8, color: '#fff', fontWeight: '700' }}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Icône du tab "Social" : le pictogramme YUMIA (sans le mot-symbole), pour
 * distinguer ce tab des emoji utilisés partout ailleurs. */
function SocialTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={SOCIAL_TAB_ICON}
        style={{ width: 24, height: 24 * (431 / 361), opacity: focused ? 1 : 0.5 }}
        contentFit="contain"
      />
    </View>
  );
}

export default function TabsLayout() {
  const unreadCount = useUnreadNotificationsCount();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
          // Avec 7 onglets répartis à parts égales, Home et Profil se
          // retrouvaient collés aux bords de l'écran (les onglets du milieu ont
          // un voisin de chaque côté qui leur donne de l'air, pas les deux du
          // bord). Cette marge leur redonne le même espace de respiration.
          paddingHorizontal: 18,
          // Android uniquement : en mode edge-to-edge (par défaut depuis
          // SDK 54), la zone de gestes/barre système du bas peut chevaucher
          // la tab bar si l'inset n'est pas ajouté explicitement — les icônes
          // apparaissent alors à moitié masquées. iOS gère déjà correctement
          // le home indicator automatiquement, donc on ne touche à rien là-bas.
          ...(Platform.OS === 'android'
            ? {
                height: TAB_BAR_BASE_HEIGHT + insets.bottom + TAB_BAR_EXTRA_BOTTOM_ANDROID,
                paddingBottom: insets.bottom + TAB_BAR_EXTRA_BOTTOM_ANDROID,
              }
            : {}),
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} /> }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: 'Carte', tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} /> }}
      />
      <Tabs.Screen
        name="explorer"
        options={{ title: 'Explorer', tabBarIcon: ({ focused }) => <TabIcon emoji="🧭" focused={focused} /> }}
      />
      <Tabs.Screen
        name="foryou"
        options={{ title: 'For You', tabBarIcon: ({ focused }) => <TabIcon emoji="✨" focused={focused} /> }}
      />
      <Tabs.Screen
        name="social"
        options={{ title: 'Social', tabBarIcon: ({ focused }) => <SocialTabIcon focused={focused} /> }}
      />
      <Tabs.Screen
        name="passport"
        options={{ title: 'Passeport', tabBarIcon: ({ focused }) => <TabIcon emoji="🎒" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} badge={unreadCount} />,
        }}
      />
    </Tabs>
  );
}
