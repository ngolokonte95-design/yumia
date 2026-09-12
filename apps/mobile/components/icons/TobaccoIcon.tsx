import { Svg, Circle, Rect, Text as SvgText } from 'react-native-svg';

/**
 * Icône du rayon « Tabac & Presse ».
 *
 * Une devanture de commerce — store rayé, vitrines, enseigne « T ». Elle
 * remplace l'emoji 🚬 : une cigarette allumée tombe sous la règle 1.4.3 de
 * l'App Store, qui vise le contenu encourageant la consommation. Le comptoir
 * vend aussi de la presse, des jeux, des timbres et des titres de transport :
 * montrer le COMMERCE plutôt qu'un produit est à la fois plus juste et sans
 * prise.
 *
 * La lettre est portée par un panneau plein : à 22 pixels sur la carte, un
 * glyphe posé sur la façade disparaîtrait, alors que le bloc rouge reste
 * lisible même quand le « T » n'est plus qu'une tache claire.
 */
interface Props {
  size?: number;
}

export function TobaccoIcon({ size = 28 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {/* Enseigne */}
      <Rect x={11.5} y={2} width={9} height={7} rx={1.5} fill="#cc2200" />
      <SvgText
        x={16}
        y={7.9}
        fontSize={6.4}
        fontWeight="700"
        fill="#ffffff"
        textAnchor="middle"
      >
        T
      </SvgText>

      {/* Façade */}
      <Rect x={4} y={14} width={24} height={14} rx={2} fill="#d9d3c6" />

      {/* Store rayé */}
      <Rect x={3} y={10.5} width={26} height={4.5} rx={1.6} fill="#cc2200" />
      <Rect x={7.2} y={10.5} width={3.4} height={4.5} fill="#f0e9dc" />
      <Rect x={14.3} y={10.5} width={3.4} height={4.5} fill="#f0e9dc" />
      <Rect x={21.4} y={10.5} width={3.4} height={4.5} fill="#f0e9dc" />

      {/* Vitrines */}
      <Rect x={6.5} y={17} width={6} height={5} rx={1} fill="#7fb2d8" />
      <Rect x={19.5} y={17} width={6} height={5} rx={1} fill="#7fb2d8" />

      {/* Porte */}
      <Rect x={13.5} y={17} width={5} height={11} rx={1} fill="#3b3b46" />
      <Circle cx={17.4} cy={23} r={0.6} fill="#d9d3c6" />
    </Svg>
  );
}
