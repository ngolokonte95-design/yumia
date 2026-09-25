import { ApiError, request } from './api';

/**
 * Traduction à la demande (bouton « Traduire », jamais automatique).
 * `context: 'message'` pour un message privé : le serveur ne met alors pas la
 * traduction en cache. Les bios, légendes et commentaires restent 'public'.
 */
export function translateMessage(
  token: string, text: string, targetLocale: string, context: 'public' | 'message' = 'public',
): Promise<{ translated: string }> {
  return request<{ translated: string }>('/chat/translate', {
    method: 'POST',
    body: { text, targetLocale, context },
    token,
  });
}

/** Quota quotidien de traductions atteint (429 renvoyé par le serveur). */
export function isTranslateQuotaError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429;
}
