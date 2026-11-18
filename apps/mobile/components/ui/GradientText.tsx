import type { ComponentType, ReactElement, ReactNode } from 'react';
import MaskedViewNative from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { gradients } from '../../theme/tokens';

// Les types de masked-view 0.3.2 s'appuient sur `NativeMethods` des anciens
// types de React Native : avec RN 0.88 la classe n'est plus reconnue comme
// composant JSX. Le composant natif, lui, n'a pas changé.
const MaskedView = MaskedViewNative as unknown as ComponentType<{
  maskElement: ReactElement;
  children?: ReactNode;
}>;

/**
 * Texte peint avec un dégradé de marque (orange → violet).
 *
 * Technique : le texte sert de masque, le dégradé est peint à travers. Le Text
 * du masque doit être opaque (couleur pleine) — c'est son alpha qui découpe le
 * dégradé, pas sa couleur.
 */
export function GradientText({
  children,
  style,
  colors = gradients.brand,
  numberOfLines,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  colors?: readonly string[];
  numberOfLines?: number;
}) {
  return (
    <MaskedView
      maskElement={<Text style={[style, { backgroundColor: 'transparent' }]} numberOfLines={numberOfLines}>{children}</Text>}
    >
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Texte transparent : ne sert qu'à donner ses dimensions au dégradé. */}
        <Text style={[style, { opacity: 0 }]} numberOfLines={numberOfLines}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}
