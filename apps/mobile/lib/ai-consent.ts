/**
 * Consentement à l'envoi de données à un fournisseur d'IA tiers (Anthropic).
 *
 * Règle App Store 5.1.2(i) (nov. 2025) : avant de partager des données
 * personnelles avec une IA tierce, l'app doit le dire clairement et obtenir
 * l'accord explicite de l'utilisateur. Toutes les fonctions qui partent chez
 * Anthropic (assistant, itinéraires, question sur un lieu, « Voir la
 * traduction », traduction dans le chat) appellent `ensureAiConsent()` avant
 * la requête : la feuille s'affiche la première fois, puis plus jamais tant
 * que le choix n'est pas retiré.
 *
 * Le choix est gardé par compte (clé AsyncStorage suffixée par l'id
 * utilisateur) : un autre compte sur le même téléphone est redemandé.
 *
 * Ce module reste sans dépendance React Native (testable sous jest) : la
 * feuille elle-même (components/AiConsentSheet) s'y enregistre comme
 * « présentateur » au montage de l'app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AiConsent = 'granted' | 'denied';
/**
 * - `ask`     : première demande (Accepter / Refuser) ;
 * - `refused` : déjà refusé — explique pourquoi la fonction ne marche pas
 *               et propose de réactiver ;
 * - `manage`  : réglage (interrupteur « Fonctions IA (Anthropic) »).
 */
export type AiConsentSheetMode = 'ask' | 'refused' | 'manage';

/** Affiche la feuille ; résout avec le choix fait, ou `null` si fermée sans choisir. */
export type AiConsentPresenter = (mode: AiConsentSheetMode) => Promise<AiConsent | null>;

const KEY_PREFIX = 'yumia.aiConsent.v1.';
const ANON = 'anon';

let currentUserId: string = ANON;
/** Choix connus par compte ; `null` = jamais demandé. Absent = pas encore lu. */
const cache = new Map<string, AiConsent | null>();
const listeners = new Set<(consent: AiConsent | null) => void>();
let presenter: AiConsentPresenter | null = null;
/** Plusieurs appels simultanés (ex. deux « Voir la traduction ») : une seule feuille. */
let pending: Promise<boolean> | null = null;

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

function notify(consent: AiConsent | null): void {
  for (const l of listeners) l(consent);
}

/** Compte courant — appelé par l'hôte de la feuille quand l'utilisateur change. */
export function setAiConsentUser(userId: string | null | undefined): void {
  currentUserId = userId || ANON;
  // Hydrate le cache pour que l'en-tête synchrone (`aiConsentHeaders`) soit juste.
  void getAiConsent().then(notify);
}

export async function getAiConsent(): Promise<AiConsent | null> {
  const id = currentUserId;
  if (cache.has(id)) return cache.get(id) ?? null;
  let value: AiConsent | null = null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(id));
    value = raw === 'granted' || raw === 'denied' ? raw : null;
  } catch {
    value = null;
  }
  cache.set(id, value);
  return value;
}

/** Lecture synchrone (cache mémoire) — `undefined` si pas encore lu. */
export function getAiConsentSync(): AiConsent | null | undefined {
  return cache.get(currentUserId);
}

export async function setAiConsent(consent: AiConsent): Promise<void> {
  const id = currentUserId;
  cache.set(id, consent);
  notify(consent);
  try {
    await AsyncStorage.setItem(keyFor(id), consent);
  } catch {
    // Le choix reste valable pour la session ; il sera redemandé au prochain lancement.
  }
}

export function subscribeAiConsent(listener: (consent: AiConsent | null) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function registerAiConsentPresenter(p: AiConsentPresenter): () => void {
  presenter = p;
  return () => { if (presenter === p) presenter = null; };
}

/**
 * À appeler juste avant toute requête qui part chez Anthropic.
 * `true` → la fonction peut tourner ; `false` → ne rien envoyer.
 */
export async function ensureAiConsent(): Promise<boolean> {
  const consent = await getAiConsent();
  if (consent === 'granted') return true;
  // Sans feuille montée (tests, écran hors arbre), on n'envoie rien : le
  // défaut sûr est l'absence de partage.
  if (!presenter) return false;
  if (pending) return pending;
  const show = presenter;
  pending = (async () => {
    const decision = await show(consent === 'denied' ? 'refused' : 'ask');
    if (decision) await setAiConsent(decision);
    return decision === 'granted';
  })().finally(() => { pending = null; });
  return pending;
}

/** Ouvre le réglage « Fonctions IA (Anthropic) » (interrupteur). */
export function openAiConsentSettings(): void {
  if (!presenter) return;
  void presenter('manage').then((decision) => (decision ? setAiConsent(decision) : undefined));
}

/**
 * En-tête envoyé aux recommandations (Top 3, For You, recherche, itinéraire
 * de l'Explorer) : ces écrans se chargent seuls, sans geste de l'utilisateur,
 * et n'envoient à l'IA qu'un contexte anonyme (ville, heure, humeur). On ne
 * les bloque donc pas derrière la feuille ; mais si l'utilisateur a REFUSÉ,
 * l'API saute l'étape IA et classe les lieux sans elle.
 */
export function aiConsentHeaders(): Record<string, string> {
  const c = cache.get(currentUserId);
  return c ? { 'X-AI-Consent': c } : {};
}

/** Réservé aux tests. */
export function __resetAiConsentForTests(): void {
  currentUserId = ANON;
  cache.clear();
  listeners.clear();
  presenter = null;
  pending = null;
}
