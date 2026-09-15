/**
 * Fabrique la pièce jointe d'un `FormData` à partir d'un fichier local.
 *
 * Pourquoi ce détour : jusqu'à Expo SDK 53, on passait à `FormData.append`
 * un objet React Native `{ uri, name, type }`. Depuis SDK 54, le `fetch` de
 * l'app suit le standard du Web, où une pièce jointe doit être un `Blob` —
 * l'ancien objet est rejeté à l'exécution avec « Unsupported FormDataPart
 * implementation », et rien ne le signale à la compilation (d'où les
 * `as never` et `@ts-expect-error` qui parsemaient les anciens appels).
 *
 * `File` d'expo-file-system implémente `Blob` et lit le fichier sur place,
 * sans le charger en mémoire : c'est ce qu'il faut pour une vidéo de story.
 * Il déduit aussi le type MIME du fichier lui-même — on ne le force plus,
 * et c'est ce type qui arrive au `fileFilter` du serveur.
 */
import { File } from 'expo-file-system';

/** Nom de fichier extrait de l'URI, extension comprise. */
function fileName(uri: string, fallback = 'upload.jpg'): string {
  const last = uri.split('?')[0].split('/').pop();
  return last && last.includes('.') ? last : fallback;
}

/**
 * Ajoute un fichier local à un `FormData`, sous le nom de champ attendu par
 * l'API. Le nom transmis garde l'extension d'origine : le serveur s'en sert
 * pour nommer le fichier stocké.
 */
export function appendFile(
  form: FormData,
  field: string,
  uri: string,
  fallbackName?: string,
): void {
  form.append(field, new File(uri), fileName(uri, fallbackName));
}
