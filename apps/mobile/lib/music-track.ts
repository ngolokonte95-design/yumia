/**
 * La piste musicale attachée à une publication.
 *
 * Elle est stockée en base dans une colonne TEXTE contenant un JSON — d'où le
 * décodage plutôt qu'un simple champ. Les publications les plus anciennes n'y
 * ont qu'un titre brut : on le rattrape au lieu d'échouer.
 *
 * Ces deux fonctions vivaient en double dans le fil et la page de détail. Le
 * plein écran en aurait fait une troisième copie.
 */
export interface MusicMeta {
  title: string;
  artist?: string;
  artworkUrl?: string;
  previewUrl?: string;
}

export function parseMusicTrack(raw?: string | null): MusicMeta | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MusicMeta;
  } catch {
    return { title: raw };
  }
}

/**
 * Les URL des CDN Deezer et iTunes ne sont pas lisibles par le lecteur audio
 * (AVFoundation les rejette : « Unable to open URL »). Seules les pistes
 * réhébergées chez nous sont jouables — on ignore donc les anciennes, qui
 * pointent encore vers ces CDN.
 */
export function isPlayableAudioUrl(url?: string | null): boolean {
  if (!url) return false;
  return !/dzcdn\.net|itunes\.apple\.com|mzstatic\.com/i.test(url);
}
