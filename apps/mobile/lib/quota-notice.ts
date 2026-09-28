/**
 * Avertissement « plus que N » avant une limite quotidienne.
 *
 * Diffusé hors de React : l'écran qui décompte (univers, carte) n'a pas à
 * dessiner lui-même l'avertissement. Un seul bandeau, monté à la racine
 * (components/QuotaNoticeBanner), l'affiche par-dessus n'importe quel écran.
 */
type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function showQuotaNotice(message: string): void {
  listeners.forEach((l) => l(message));
}

export function onQuotaNotice(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
