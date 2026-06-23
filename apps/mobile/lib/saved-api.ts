import { request } from './api';

export function savePlaceRequest(token: string, placeId: string): Promise<void> {
  return request<void>('/saved', { method: 'POST', body: { placeId }, token });
}

export function unsavePlaceRequest(token: string, placeId: string): Promise<void> {
  return request<void>(`/saved/${placeId}`, { method: 'DELETE', token });
}

export function getSavedIdsRequest(token: string): Promise<string[]> {
  return request<string[]>('/saved/ids', { token });
}
