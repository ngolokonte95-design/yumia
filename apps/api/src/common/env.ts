/**
 * Lecture d'une variable d'environnement avec repli.
 *
 * `process.env.X ?? repli` ne suffit pas : docker-compose écrit
 * `X: ${X:-}` pour rendre une variable facultative, ce qui définit la variable
 * à la CHAÎNE VIDE plutôt que de la laisser absente. `??` ne bascule que sur
 * `null`/`undefined`, le repli n'était donc jamais appliqué — c'est ce qui a
 * produit un `success_url` réduit à « /shop/order-success », refusé par Stripe
 * avec « Not a valid URL » au premier paiement réel.
 */
export function envOr(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw != null && raw.trim() !== '' ? raw.trim() : fallback;
}
