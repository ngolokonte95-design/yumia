/**
 * Reconnaît une vidéo à son URL.
 *
 * Le backend ne renvoie aucun champ `mediaType`, et `videoUrl` n'est pas
 * systématiquement renseigné : la plupart des vidéos vivent dans `mediaUrls`,
 * mêlées aux photos. L'extension du fichier est donc la seule indication
 * disponible — s'être fié à `videoUrl` a déjà fait rendre des vidéos en
 * `<Image>` (miniatures cassées dans la grille du profil et sur l'écran de
 * détail).
 *
 * Cette fonction était recopiée à l'identique dans social.tsx, post/[id].tsx
 * et social-profile.tsx ; reels.tsx en avait besoin à son tour, d'où le
 * regroupement ici plutôt qu'une quatrième copie.
 */
export function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes('/video');
}
