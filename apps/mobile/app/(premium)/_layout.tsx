import { Stack } from 'expo-router';
import { colors } from '../../theme/tokens';

export default function PremiumLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_bottom',
      }}
    />
  );
}
