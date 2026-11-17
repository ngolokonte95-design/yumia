import { Text } from 'react-native';
import { UNIVERSE_META } from '@yumia/shared';
import { universeIcon } from './icons/universeIcons';

/**
 * Icône d'un univers à la taille voulue : l'icône dessinée si le registre en
 * a une, sinon l'emoji de l'univers.
 */
export function UniverseGlyph({ u, size }: { u: string; size: number }) {
  return universeIcon(u, size) ?? (
    <Text style={{ fontSize: size * 0.85 }}>{UNIVERSE_META[u as keyof typeof UNIVERSE_META]?.emoji ?? '📍'}</Text>
  );
}
