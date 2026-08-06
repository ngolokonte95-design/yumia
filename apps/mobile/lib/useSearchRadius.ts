/**
 * Rayon de recherche choisi par l'utilisateur pour la carte des lieux (en km),
 * persisté localement (AsyncStorage) et réutilisé à chaque ouverture de l'app.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@yumia/map_search_radius_km';

export const RADIUS_PRESETS_KM = [1, 3, 5, 10, 20, 50] as const;
export const DEFAULT_RADIUS_KM = 5;

/** Valide et arrondit un rayon reçu (stockage, saisie…) ; retombe sur le défaut si invalide. */
export function sanitizeRadiusKm(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS_KM;
  return Math.min(200, Math.round(n));
}

export function useSearchRadius() {
  const [radiusKm, setRadiusKmState] = useState(DEFAULT_RADIUS_KM);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw != null) setRadiusKmState(sanitizeRadiusKm(raw));
      })
      .catch(() => { /* défaut conservé */ });
  }, []);

  const setRadiusKm = useCallback((km: number) => {
    const clean = sanitizeRadiusKm(km);
    setRadiusKmState(clean);
    AsyncStorage.setItem(KEY, String(clean)).catch(() => { /* pas grave, juste pas persisté */ });
  }, []);

  return { radiusKm, setRadiusKm };
}
