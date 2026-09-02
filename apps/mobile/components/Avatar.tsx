import type { ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { Plan } from '@yumia/shared';
import { PLAN_BADGE_META } from '@yumia/shared';
import { colors } from '../theme/tokens';

const BADGE_ASSETS = {
  silver: require('../assets/badges/silver.png'),
  gold: require('../assets/badges/gold.png'),
  diamond: require('../assets/badges/diamond.png'),
} as const;

/**
 * Avatar avec badge de statut (Plus/Gold/Diamond) en incrustation — petit
 * cercle en bas à droite, légèrement chevauchant, comme demandé au design.
 * Aucun badge affiché pour `plan: 'free'` ou `plan` absent.
 *
 * Utilisation : partout où une photo de profil est affichée (profil, posts,
 * commentaires, résultats de recherche, messages…) — remplace progressivement
 * les <Image source={{uri: photoUrl}}> bruts au fil des écrans.
 */
export function Avatar({
  uri,
  size,
  plan,
  style,
  fallback,
  borderWidth,
  borderColor,
  placeholderColor,
}: {
  uri?: string | null;
  size: number;
  /** Niveau d'abonnement de cet utilisateur — détermine le badge affiché (ou son absence). */
  plan?: Plan | null;
  style?: StyleProp<ViewStyle>;
  /** Contenu affiché quand `uri` est absent (ex. initiale du nom). */
  fallback?: ReactNode;
  /** Repris tels quels par les écrans qui bordaient déjà leur avatar. */
  borderWidth?: number;
  borderColor?: string;
  /** Fond du cercle de repli (sans photo) — colors.surface par défaut. */
  placeholderColor?: string;
}) {
  const badge = plan ? PLAN_BADGE_META[plan] : undefined;
  // Taille du badge : assez grand pour être identifiable immédiatement, assez
  // petit pour rester élégant — ~38% de l'avatar, borné pour les très petites
  // tailles (ex. avatar 24px dans une liste dense) où un badge illisible ne
  // sert à rien.
  const badgeSize = Math.max(12, Math.round(size * 0.38));
  const border = borderWidth ? { borderWidth, borderColor } : null;

  return (
    <View style={[{ width: size, height: size }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }, border]}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: size / 2 },
            placeholderColor ? { backgroundColor: placeholderColor } : null,
            border,
          ]}
        >
          {fallback}
        </View>
      )}
      {badge && (
        <View
          style={[
            styles.badgeRing,
            {
              width: badgeSize + 4,
              height: badgeSize + 4,
              borderRadius: (badgeSize + 4) / 2,
              right: -badgeSize * 0.12,
              bottom: -badgeSize * 0.12,
            },
          ]}
        >
          <Image
            source={BADGE_ASSETS[badge.asset]}
            style={{ width: badgeSize, height: badgeSize }}
            contentFit="contain"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surface },
  placeholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  // Petit fond derrière le badge (ton du fond de l'app) : le fait ressortir
  // nettement, quelle que soit la photo de profil en dessous.
  badgeRing: {
    position: 'absolute',
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
