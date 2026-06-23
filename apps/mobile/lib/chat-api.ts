import { request } from './api';

export interface ChatPayload {
  message: string;
  placeName: string;
  placeUniverse: string;
  placeAddress?: string;
  lat?: number;
  lng?: number;
  locale?: string;
}

export function askAboutPlace(token: string | null, payload: ChatPayload): Promise<{ reply: string }> {
  return request<{ reply: string }>('/recommendations/chat', {
    method: 'POST',
    body: payload,
    token: token ?? undefined,
  });
}
