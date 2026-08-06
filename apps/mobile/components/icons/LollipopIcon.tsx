import Svg, { Circle, Rect } from 'react-native-svg';

interface Props {
  size?: number;
}

/**
 * Sucette dessinée à la main plutôt que l'emoji 🍭 : sur iOS, ce dernier a un
 * bâton légèrement courbé et une tête à motif spirale — pas le « bâton droit,
 * tête ronde rouge » demandé, et le rendu de toute façon varie selon l'OS.
 * Une icône vectorielle garantit une forme identique sur toutes les plateformes.
 */
export function LollipopIcon({ size = 18 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* Bâton — droit, blanc */}
      <Rect x={14.5} y={16} width={3} height={14} rx={1.5} fill="#fff" />
      {/* Tête — ronde, rouge pleine */}
      <Circle cx={16} cy={12} r={11} fill="#E5484D" />
      {/* Reflet, pour un peu de relief sans casser la forme ronde pleine */}
      <Circle cx={12.5} cy={8.5} r={3} fill="#fff" opacity={0.35} />
    </Svg>
  );
}
