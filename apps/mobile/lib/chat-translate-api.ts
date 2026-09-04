import { request } from './api';

/** Traduction à la demande d'un message de chat (bouton "Traduire", pas d'appel automatique). */
export function translateMessage(token: string, text: string, targetLocale: string): Promise<{ translated: string }> {
  return request<{ translated: string }>('/chat/translate', {
    method: 'POST',
    body: { text, targetLocale },
    token,
  });
}
