/**
 * Abstraction mince sur react-native-purchases (RevenueCat).
 * - initPurchases() : à appeler une seule fois au démarrage, dès que l'userId est connu.
 * - fetchOfferings() : retourne les offres disponibles (packages mensuel / annuel).
 * - buyPackage()     : lance l'achat natif et retourne le customerInfo mis à jour.
 *
 * Si les clés RevenueCat ne sont pas configurées (env vide), les fonctions
 * sont des no-ops silencieux, ce qui permet de tester le reste de l'UI.
 */
import Purchases, {
  LOG_LEVEL,
  type PurchasesOfferings,
  type PurchasesPackage,
  type CustomerInfo,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const IOS_KEY =
  (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY as string | undefined) ??
  (Constants.expoConfig?.extra?.revenueCatIosKey as string | undefined) ??
  '';

const ANDROID_KEY =
  (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY as string | undefined) ??
  (Constants.expoConfig?.extra?.revenueCatAndroidKey as string | undefined) ??
  '';

let initialized = false;

export function initPurchases(): void {
  if (initialized) return;
  const apiKey = Platform.select({ ios: IOS_KEY, android: ANDROID_KEY, default: '' });
  if (!apiKey) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey });
  initialized = true;
}

export async function fetchOfferings(): Promise<PurchasesOfferings | null> {
  if (!initialized) return null;
  try {
    return await Purchases.getOfferings();
  } catch {
    return null;
  }
}

export async function buyPackage(
  pkg: PurchasesPackage,
): Promise<{ customerInfo: CustomerInfo } | null> {
  if (!initialized) return null;
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return { customerInfo };
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!initialized) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/**
 * Identifie l'utilisateur auprès de RevenueCat après connexion.
 * Permet de récupérer les achats passés sur un autre appareil.
 */
export async function loginPurchases(userId: string): Promise<void> {
  if (!initialized) return;
  try {
    await Purchases.logIn(userId);
  } catch {
    // Non bloquant — l'achat sera ré-associé au prochain fetchOfferings.
  }
}

/** Déconnecte l'utilisateur de RevenueCat (retour à l'identifiant anonyme). */
export async function logoutPurchases(): Promise<void> {
  if (!initialized) return;
  try {
    await Purchases.logOut();
  } catch {
    // Non bloquant.
  }
}

/**
 * Restaure les achats précédents de l'utilisateur (réinstallation, changement d'appareil).
 * Retourne true si un entitlement payant (plus/gold/diamond) est actif après restauration
 * — le webhook côté serveur mettra à jour `plan` séparément, ceci ne sert qu'au message
 * affiché immédiatement dans l'app.
 */
export async function restorePurchases(): Promise<boolean> {
  if (!initialized) return false;
  try {
    const customerInfo = await Purchases.restorePurchases();
    const active = customerInfo.entitlements.active;
    return !!(active['diamond'] || active['gold'] || active['plus']);
  } catch {
    return false;
  }
}

/**
 * Retrouve le package RevenueCat correspondant à un palier (Plus/Gold/Diamond),
 * par l'identifiant du package OU du produit sous-jacent contenant le nom du
 * palier (ex. "yumia_gold_monthly") — même convention que côté serveur
 * (webhooks.service.ts, resolvePlan). Un seul package par palier pour
 * l'instant (mensuel uniquement, pas d'annuel).
 */
export function packageForTier(
  offerings: PurchasesOfferings | null,
  tier: 'plus' | 'gold' | 'diamond',
): PurchasesPackage | null {
  const pkgs = offerings?.current?.availablePackages ?? [];
  return (
    pkgs.find(
      (p) =>
        p.identifier.toLowerCase().includes(tier) ||
        p.product.identifier.toLowerCase().includes(tier),
    ) ?? null
  );
}
