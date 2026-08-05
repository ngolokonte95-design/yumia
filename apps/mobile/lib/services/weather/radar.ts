/**
 * Radar de précipitations.
 *
 * Service séparé du fournisseur météo : les tuiles radar et les prévisions
 * chiffrées viennent rarement de la même source, et on veut pouvoir changer
 * l'un sans toucher l'autre.
 */

export interface RadarFrame {
  /** Instant de la mesure, en ISO 8601 UTC. */
  time: string;
  /**
   * Gabarit d'URL de tuile, avec les jetons `{z}`, `{x}` et `{y}` attendus par
   * `UrlTile` de react-native-maps.
   */
  tileUrlTemplate: string;
  /** Vrai s'il s'agit d'une prévision plutôt que d'une observation passée. */
  forecast: boolean;
}

export interface RadarProvider {
  readonly id: string;
  readonly attribution: string;
  fetchFrames(signal?: AbortSignal): Promise<RadarFrame[]>;
}

interface RainViewerIndex {
  host?: string;
  radar?: {
    past?: Array<{ time: number; path: string }>;
    nowcast?: Array<{ time: number; path: string }>;
  };
}

/**
 * RainViewer : couverture radar mondiale, gratuite et sans clé d'API.
 *
 * L'index publie les chemins des dernières frames (~2 h de passé, plus une
 * courte prévision) ; chaque chemin se complète en gabarit de tuiles.
 */
export class RainViewerProvider implements RadarProvider {
  readonly id = 'rainviewer';
  readonly attribution = 'RainViewer';

  private static readonly INDEX_URL = 'https://api.rainviewer.com/public/weather-maps.json';

  /**
   * Suffixe des tuiles : taille 256, palette 2 (bleu → rouge), lissage activé
   * et fond transparent — indispensable pour superposer proprement à la carte.
   */
  private static readonly TILE_SUFFIX = '/256/{z}/{x}/{y}/2/1_1.png';

  async fetchFrames(signal?: AbortSignal): Promise<RadarFrame[]> {
    const res = await fetch(RainViewerProvider.INDEX_URL, { signal });
    if (!res.ok) throw new Error(`RainViewer a répondu ${res.status}`);

    const data = (await res.json()) as RainViewerIndex;
    const host = data.host ?? 'https://tilecache.rainviewer.com';

    const build = (
      list: Array<{ time: number; path: string }> | undefined,
      forecast: boolean,
    ): RadarFrame[] => (list ?? []).map((f) => ({
      time: new Date(f.time * 1000).toISOString(),
      tileUrlTemplate: `${host}${f.path}${RainViewerProvider.TILE_SUFFIX}`,
      forecast,
    }));

    return [...build(data.radar?.past, false), ...build(data.radar?.nowcast, true)];
  }
}

let instance: RadarProvider | null = null;

/** Fabrique — unique endroit à modifier pour changer de source radar. */
export function getRadarProvider(): RadarProvider {
  instance ??= new RainViewerProvider();
  return instance;
}

export function setRadarProvider(provider: RadarProvider): void {
  instance = provider;
}
