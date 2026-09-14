/**
 * Fabrique la pièce jointe d'un `FormData` à partir d'un fichier local.
 *
 * Pourquoi ce détour : jusqu'à Expo SDK 53, on passait à `FormData.append`
 * un objet React Native `{ uri, name, type }`. Depuis SDK 54, le `fetch` de
 * l'app suit le standard du Web, où une pièce jointe doit être un `Blob` —
 * l'ancien objet est rejeté à l'exécution avec « Unsupported FormDataPart
 * implementation », sans que rien ne le signale à la compilation.
 *
 * `File` d'expo-file-system implémente `Blob` et lit le fichier sur place,
 * sans le charger en mémoire : c'est ce qu'il faut pour une vidéo de story.
 */
import { File } from 'expo-file-system';

/** Type MIME déduit de l'extension, avec un repli raisonnable. */
const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  webm: 'video/webm',
  m4a: 'audio/mp4',
};

export function fileName(uri: string, fallback = 'upload.jpg'): string {
  const last = uri.split('?')[0].split('/').pop();
  return last && last.includes('.') ? last : fallback;
}

export function mimeType(uri: string): string {
  const ext = fileName(uri).split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'image/jpeg';
}

/**
 * Ajoute un fichier local à un `FormData`, sous le nom de champ attendu par
 * l'API. Le nom de fichier transmis garde l'extension d'origine : le serveur
 * s'en sert pour choisir le dossier et valider le type.
 */
export function appendFile(
  form: FormData,
  field: string,
  uri: string,
  fallbackName?: string,
): void {
  form.append(field, new File(uri), fileName(uri, fallbackName));
}
