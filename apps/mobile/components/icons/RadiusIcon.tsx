import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';

interface Props {
  size?: number;
}

/**
 * Icône du sélecteur de rayon sur la carte : un pin de localisation entouré
 * de deux cercles concentriques (un plein, un pointillé — le rayon de
 * recherche), dégradé violet → orange repris de l'image fournie par
 * l'utilisateur (mêmes teintes que `gradients.brand` des tokens, juste
 * réordonnées : violet à gauche, orange à droite, comme sur la référence).
 * Le nombre de km reste affiché à côté en texte (dynamique, ne peut pas être
 * gravé dans l'icône) — la référence servait de maquette d'app icon, on n'en
 * reprend ici que le pictogramme, adapté à la taille d'une pastille de bouton.
 */
export function RadiusIcon({ size = 18 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Defs>
        <LinearGradient id="radiusGrad" x1="3" y1="4" x2="29" y2="20" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#8B4FD6" />
          <Stop offset="0.55" stopColor="#C15A9E" />
          <Stop offset="1" stopColor="#E8621A" />
        </LinearGradient>
      </Defs>
      {/* Cercle extérieur pointillé — le rayon */}
      <Circle cx={16} cy={16} r={13.2} stroke="url(#radiusGrad)" strokeWidth={1.7} strokeDasharray="3.1 3.1" fill="none" />
      {/* Cercle intérieur plein */}
      <Circle cx={16} cy={16} r={9.3} stroke="url(#radiusGrad)" strokeWidth={1.7} fill="none" />
      {/* Pin de localisation, centré */}
      <Path
        d="M16 8.3c-2.7 0-4.9 2.2-4.9 4.9 0 3.6 4.9 8.6 4.9 8.6s4.9-5 4.9-8.6c0-2.7-2.2-4.9-4.9-4.9z"
        fill="url(#radiusGrad)"
      />
      <Circle cx={16} cy={13.2} r={2} fill="#0E0E12" />
    </Svg>
  );
}
