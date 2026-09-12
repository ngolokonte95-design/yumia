import { Svg, Rect } from 'react-native-svg';

/**
 * Icône du rayon « Coffee shops ».
 *
 * Un gros fauteuil, c'est-à-dire ce que le LIEU est : un endroit où l'on
 * s'assoit et où l'on reste. L'icône précédente montrait un personnage à
 * dreadlocks fumant un joint — bien plus explicite que le nom du rayon, lisible
 * sans traduction par n'importe quel examinateur d'App Store, et contraire à la
 * règle 1.4.3 qui vise le contenu encourageant la consommation. Elle portait en
 * prime un risque de caricature ethnique.
 *
 * Les trois couleurs sont réparties PAR PARTIE du meuble plutôt qu'en bandes :
 * un dossier rayé se lit comme un drapeau, et à 22 pixels sur la carte les
 * bandes se mélangent. Ainsi la silhouette reste celle d'un fauteuil — c'est
 * elle qu'on reconnaît de loin, pas les couleurs.
 */
interface Props {
  size?: number;
}

export function CoffeeShopIcon({ size = 28 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* Pieds */}
      <Rect x={6} y={23.5} width={3} height={3.5} rx={1} fill="#2e1a00" />
      <Rect x={23} y={23.5} width={3} height={3.5} rx={1} fill="#2e1a00" />

      {/* Dossier */}
      <Rect x={7} y={5} width={18} height={15} rx={5} fill="#1a8a00" />
      <Rect x={9.5} y={7.5} width={13} height={10} rx={3.5} fill="#22a806" />

      {/* Accoudoirs */}
      <Rect x={3} y={12.5} width={6} height={11} rx={3} fill="#cc2200" />
      <Rect x={23} y={12.5} width={6} height={11} rx={3} fill="#cc2200" />

      {/* Assise, avec son ombre portée dessous */}
      <Rect x={5.5} y={16.5} width={21} height={7.5} rx={3} fill="#f5c400" />
      <Rect x={5.5} y={21} width={21} height={3} rx={1.5} fill="#d9a900" />
    </Svg>
  );
}
