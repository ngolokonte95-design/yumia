/**
 * Fabrique la pièce jointe d'un `FormData` à partir d'un fichier local.
 *
 * Pourquoi ce détour : jusqu'à Expo SDK 53, on passait à `FormData.append`
 * un objet React Native `{ uri, name, type }`. Depuis SDK 54, le `fetch` de
 * l'app suit le standard du Web, et `expo/src/winter/fetch/convertFormData.ts`
 * n'accepte qu'une chaîne, un `Blob`, ou un objet exposant `bytes()`. L'ancien
 * objet n'est rien de tout ça : il est rejeté à l'exécution avec « Unsupported
 * FormDataPart implementation », et rien ne le signale à la compilation (d'où
 * les `as never` et `@ts-expect-error` qui parsemaient les anciens appels).
 *
 * `File` d'expo-file-system expose `bytes()` et lit le fichier sur place, sans
 * le charger en mémoire : c'est ce qu'il faut pour une vidéo de story.
 *
 * Le **nom de fichier et le type MIME envoyés sont ceux du fichier lui-même** :
 * cette implémentation les lit sur l'objet (`file.name`, `file.type`) et ignore
 * le troisième argument d'`append`. On ne peut donc plus forcer un type comme
 * le faisaient les anciens appels — c'est `file.type` qui arrive au
 * `fileFilter` du serveur.
 */
import { File } from 'expo-file-system';

/** Ajoute un fichier local à un `FormData`, sous le nom de champ attendu par l'API. */
export function appendFile(form: FormData, field: string, uri: string): void {
  form.append(field, new File(uri));
}
