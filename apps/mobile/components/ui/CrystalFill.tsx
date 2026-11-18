import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../../theme/tokens';

/**
 * Verre serti de cristal — 18/11/2026.
 *
 * Remplace les aplats blancs trop crus des éléments choisis (bouton
 * principal, onglet actif, pastille) : un verre fumé serti d'un liseré qui
 * accroche la lumière sur ses arêtes (blanc pur → argent froid en diagonale),
 * avec un léger reflet en haut. Même matière que les titres « blanc cristal »
 * de l'Accueil. Aucune couleur.
 *
 * Se pose en PREMIER enfant d'une pastille qui coupe ses coins
 * (`overflow: 'hidden'` + `borderRadius`) ; le contenu vient par-dessus.
 */
const CRYSTAL_EDGE = [
  'rgba(255,255,255,0.95)', 'rgba(174,187,208,0.30)', 'rgba(255,255,255,0.70)',
  'rgba(140,152,175,0.22)', 'rgba(255,255,255,0.90)',
] as const;
const CRYSTAL_SHEEN = ['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)'] as const;

export function CrystalFill({ edge = 1.2, core = '#14151D' }: {
  /** Épaisseur du liseré, en points. */
  edge?: number;
  /** Couleur du verre à l'intérieur du liseré. */
  core?: string;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={CRYSTAL_EDGE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.core, { top: edge, left: edge, right: edge, bottom: edge, backgroundColor: core }]}>
        <LinearGradient colors={CRYSTAL_SHEEN} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  core: { position: 'absolute', borderRadius: radius.pill, overflow: 'hidden' },
});
