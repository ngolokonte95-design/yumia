import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { gradients } from '../../theme/tokens';

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
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  colors?: readonly string[];
}) {
  return (
    <MaskedView
      maskElement={<Text style={[style, { backgroundColor: 'transparent' }]}>{children}</Text>}
    >
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Texte transparent : ne sert qu'à donner ses dimensions au dégradé. */}
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}
