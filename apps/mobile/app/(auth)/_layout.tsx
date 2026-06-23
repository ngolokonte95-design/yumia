import { Stack } from 'expo-router';
import { colors } from '../../theme/tokens';

/** Pile d'écrans d'authentification (hors barre d'onglets). */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
