import { Image } from 'expo-image';
import { View, StyleSheet, type ViewStyle, type ImageStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/tokens';

const LOGO = require('../assets/logo.png');

/**
 * Logo YUMIA (image carrée 1024×1024). `height` = hauteur ET largeur — le logo
 * est carré, on garde donc un ratio 1:1. Affiché bien visible dans chaque page.
 */
export function YumiaLogo({ height = 120, style }: { height?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={LOGO}
      style={[{ width: height, height }, style]}
      contentFit="contain"
      transition={150}
    />
  );
}

/**
 * En-tête de page réutilisable : logo YUMIA centré et bien visible, gère le
 * safe-area haut. À poser en tout premier enfant de l'écran (retirer alors le
 * paddingTop: insets.top du conteneur pour éviter le double espacement).
 */
export function LogoHeader({ size = 92, style }: { size?: number; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }, style]}>
      <YumiaLogo height={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, paddingBottom: 4 },
});
