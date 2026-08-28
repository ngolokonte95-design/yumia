import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { useUnreadNotificationsCount } from '../../lib/useNotifications';

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

export default function TabsLayout() {
  const unreadCount = useUnreadNotificationsCount();

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
        options={{ title: 'Social', tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} /> }}
      />
      <Tabs.Screen
        name="deals"
        options={{ title: 'Bons plans', tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} /> }}
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
