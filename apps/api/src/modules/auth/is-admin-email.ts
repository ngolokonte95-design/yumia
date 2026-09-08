/**
 * Appartenance à ADMIN_EMAILS.
 *
 * Lu à chaque appel plutôt que mis en cache : ajouter un admin sur le serveur
 * prend effet sans redémarrer l'API.
 */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const allowed = new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(email.toLowerCase());
}
