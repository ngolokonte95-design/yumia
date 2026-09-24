/**
 * Enregistre une photo ou une vidéo distante dans la galerie du téléphone.
 *
 * Téléchargement dans le cache puis dépôt via expo-media-library — même
 * mécanique que l'enregistrement d'une story (app/story-viewer.tsx). Le module
 * est importé à la demande : son module natif lève dès l'import s'il manque
 * (Expo Go sans la bibliothèque), et ça ne doit pas empêcher l'écran d'ouvrir.
 *
 * @returns `'saved'`, `'denied'` (autorisation refusée) ou `'error'`.
 */
import { Directory, File, Paths } from 'expo-file-system';

export async function saveRemoteMediaToGallery(url: string): Promise<'saved' | 'denied' | 'error'> {
  try {
    // API « legacy » : depuis le SDK 57, saveToLibraryAsync importé de la
    // racine du paquet lève systématiquement (méthode dépréciée).
    const MediaLibrary = await import('expo-media-library/legacy');
    const perm = await MediaLibrary.requestPermissionsAsync(true); // écriture seule : aucune lecture de la galerie
    if (!perm.granted) return 'denied';
    const dest = new Directory(Paths.cache, `media-${Date.now()}`);
    dest.create();
    const file = await File.downloadFileAsync(url, dest, { idempotent: true });
    await MediaLibrary.saveToLibraryAsync(file.uri);
    return 'saved';
  } catch {
    return 'error';
  }
}
