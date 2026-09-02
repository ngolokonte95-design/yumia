/**
 * Redirection — cet écran activait le Premium sans jamais vérifier l'achat
 * côté serveur (POST /auth/premium/activate acceptait l'activation même sans
 * offering RevenueCat configuré, "pour permettre les tests" selon l'ancien
 * commentaire) : n'importe quel compte connecté pouvait obtenir Plus
 * gratuitement en appelant cet écran. /plus est le seul parcours d'achat
 * désormais — passe par un vrai achat RevenueCat, vérifié par le webhook
 * serveur (webhooks.service.ts) avant de mettre à jour `plan`.
 *
 * L'endpoint backend /auth/premium/activate n'a pas été touché ici (portée
 * de ce changement : fermer l'accès depuis l'app) — à sécuriser ou retirer
 * séparément si rien d'autre n'en dépend.
 */
import { Redirect } from 'expo-router';

export default function PremiumScreen() {
  return <Redirect href="/plus" />;
}
