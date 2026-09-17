/**
 * Champ mot de passe avec un œil à droite pour afficher ou masquer la saisie.
 *
 * Reprend exactement le style du champ qu'il remplace (`style`), en réservant
 * seulement la place de l'icône à droite.
 */
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors } from '../theme/tokens';

type Props = Omit<TextInputProps, 'secureTextEntry'>;

export const PasswordInput = forwardRef<TextInput, Props>(function PasswordInput({ style, ...props }, ref) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={ref}
        {...props}
        style={[style, styles.input]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        style={styles.eye}
        onPress={() => setVisible((v) => !v)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <Circle cx={12} cy={12} r={3} />
          {visible ? null : <Line x1={3} y1={3} x2={21} y2={21} />}
        </Svg>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'relative', justifyContent: 'center' },
  input: { paddingRight: 48 },
  eye: { position: 'absolute', right: 14, height: '100%', justifyContent: 'center' },
});
