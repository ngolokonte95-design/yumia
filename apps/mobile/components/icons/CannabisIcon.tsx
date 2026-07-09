import Svg, { Circle, Ellipse, Path, Rect, G } from 'react-native-svg';

interface Props {
  size?: number;
}

export function CannabisIcon({ size = 28 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* Dreads gauche */}
      <Ellipse cx={9} cy={24} rx={2.5} ry={6} fill="#3a2000" />
      <Ellipse cx={6} cy={23} rx={2} ry={5} fill="#2e1a00" />
      <Ellipse cx={12} cy={26} rx={2} ry={5} fill="#3a2000" />
      {/* Dreads droite */}
      <Ellipse cx={23} cy={24} rx={2.5} ry={6} fill="#3a2000" />
      <Ellipse cx={26} cy={23} rx={2} ry={5} fill="#2e1a00" />
      <Ellipse cx={20} cy={26} rx={2} ry={5} fill="#3a2000" />

      {/* Visage */}
      <Circle cx={16} cy={20} r={8} fill="#c68642" />

      {/* Chapeau rasta — fond rouge */}
      <Rect x={8} y={7} width={16} height={10} rx={2} fill="#cc2200" />
      {/* Bande jaune */}
      <Rect x={8} y={10} width={16} height={3.5} fill="#f5c400" />
      {/* Bande verte */}
      <Rect x={8} y={13.5} width={16} height={3.5} rx={1} fill="#1a8a00" />
      {/* Sommet arrondi */}
      <Ellipse cx={16} cy={7} rx={8} ry={3} fill="#cc2200" />
      {/* Bord bas du chapeau */}
      <Ellipse cx={16} cy={17} rx={9} ry={2.5} fill="#111" />

      {/* Yeux (petits, détendus — mi-clos) */}
      <Path d="M12.5 19.5 Q13.5 18.8 14.5 19.5" stroke="#1a0a00" strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <Path d="M17.5 19.5 Q18.5 18.8 19.5 19.5" stroke="#1a0a00" strokeWidth={1.2} fill="none" strokeLinecap="round" />

      {/* Sourire */}
      <Path d="M13 22.5 Q16 25 19 22.5" stroke="#1a0a00" strokeWidth={1.2} fill="none" strokeLinecap="round" />

      {/* Joint (cigarette) au coin de la bouche */}
      <Rect x={19} y={22} width={5.5} height={1.5} rx={0.7} fill="#f5f0e0" transform="rotate(-10 19 22)" />
      {/* Braise du joint */}
      <Circle cx={24.2} cy={21.4} r={0.9} fill="#ff5500" />
      {/* Fumée */}
      <Path d="M24.5 21 Q25.5 19.5 24.5 18 Q25.5 16.5 24.8 15" stroke="#aaa" strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.7} />
    </Svg>
  );
}
