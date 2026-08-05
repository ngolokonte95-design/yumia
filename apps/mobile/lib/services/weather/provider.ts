import type { Coordinates, WeatherReport } from './types';

/**
 * Contrat que doit remplir tout fournisseur météo.
 *
 * Les écrans ne connaissent que cette interface — jamais une implémentation.
 * Ajouter WeatherAPI.com ou OpenWeather demain revient donc à écrire une classe
 * de plus et à changer une ligne dans la fabrique, sans toucher à l'UI.
 */
export interface WeatherProvider {
  /** Identifiant court, utile pour le diagnostic et les logs. */
  readonly id: string;
  /** Nom à afficher en mention légale si le fournisseur l'exige. */
  readonly attribution: string;
  /**
   * Récupère le rapport complet pour un point donné.
   * @throws si le réseau échoue ou si la réponse est inexploitable.
   */
  fetchReport(coords: Coordinates, signal?: AbortSignal): Promise<WeatherReport>;
}

/** Erreur normalisée — permet à l'UI de distinguer un souci réseau d'un bug. */
export class WeatherUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'WeatherUnavailableError';
  }
}
