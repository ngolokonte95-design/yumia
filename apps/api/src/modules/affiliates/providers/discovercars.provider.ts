import { Injectable, Logger } from '@nestjs/common';
import type { Place } from '@prisma/client';
import type { AffiliateProvider } from './affiliate-provider.interface';

const BASE = 'https://www.discovercars.com';
/** Une page ville vérifiée (ou reconnue absente) ne l'est plus avant ce délai. */
const CHECK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 5_000;

/** Langues de discovercars.com qui ont un préfixe d'URL (`/fr/…`). */
const SITE_LANGUAGES = new Set(['fr', 'es', 'pt', 'it', 'de', 'nl', 'pl', 'sv', 'ru']);

/** Minuscules, sans accents, tirets : « São Paulo » → « sao-paulo ». */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Chemins candidats d'une page ville Discover Cars, du plus probable au moins
 * probable. Format relevé sur le générateur de l'espace affilié :
 * `/fr/france/paris`, `/fr/united-kingdom/london`, et pour les États-Unis
 * l'État accolé au pays : `/fr/usa-washington/washington`.
 *
 * @param regions noms (anglais) des niveaux entre la ville et le pays — l'État
 *   pour une ville américaine, s'il est connu.
 */
export function carRentalPathCandidates(country: string, city: string, regions: string[]): string[] {
  const c = slugify(country);
  const v = slugify(city);
  if (!c || !v) return [];
  const isUsa = c === 'united-states' || c === 'usa' || c === 'united-states-of-america';
  if (isUsa) {
    // Sans État, on tente la ville elle-même comme État (Washington, New York).
    const states = [...regions.map(slugify).filter(Boolean), v];
    return [...new Set(states)].map((s) => `usa-${s}/${v}`);
  }
  return [`${c}/${v}`];
}

/**
 * Discover Cars — location de voitures (commission sur leur marge, cookie 365 j).
 * Pas d'API de recherche pour les affiliés : on ouvre la page de la ville sur
 * leur site, avec notre identifiant (`a_aid`).
 *
 * Ces pages ont une adresse devinée à partir du nom anglais de la ville ; une
 * adresse fausse mènerait à une page d'erreur chez eux. D'où `cityLink`, qui
 * vérifie que la page existe avant de la donner, et retombe sinon sur leur
 * page d'accueil — toujours avec notre identifiant.
 */
@Injectable()
export class DiscoverCarsProvider implements AffiliateProvider {
  private readonly logger = new Logger(DiscoverCarsProvider.name);
  readonly key = 'discovercars' as const;
  readonly universes = ['car_rental'] as const;

  private readonly checked = new Map<string, { ok: boolean | null; at: number }>();

  private get aid(): string | undefined {
    return process.env.DISCOVERCARS_AFFILIATE_ID;
  }

  isConfigured(): boolean {
    return !!this.aid;
  }

  private withAid(path: string): string {
    return `${BASE}${path}?a_aid=${encodeURIComponent(this.aid!)}`;
  }

  private langPrefix(locale?: string): string {
    const l = (locale ?? '').slice(0, 2).toLowerCase();
    return SITE_LANGUAGES.has(l) ? `/${l}` : '';
  }

  generateBookingLink(_place: Pick<Place, 'id' | 'name' | 'city' | 'lat' | 'lng'>): string | null {
    return this.isConfigured() ? this.withAid('/') : null;
  }

  generateGenericLink(): string | null {
    return this.isConfigured() ? this.withAid('/') : null;
  }

  /**
   * Lien vers la page location de voitures d'une ville.
   * @returns `exact: false` quand aucune page ville n'a pu être confirmée — le
   *   lien mène alors à l'accueil du site, où l'utilisateur tape sa ville.
   */
  async cityLink(
    names: { country: string; city: string; regions: string[] } | null,
    locale?: string,
  ): Promise<{ url: string; exact: boolean } | null> {
    if (!this.isConfigured()) return null;
    const prefix = this.langPrefix(locale);
    const home = { url: this.withAid(`${prefix}/`), exact: false };
    if (!names) return home;

    const candidates = carRentalPathCandidates(names.country, names.city, names.regions);
    for (const candidate of candidates.slice(0, 3)) {
      const path = `${prefix}/${candidate}`;
      const ok = await this.pageExists(path);
      if (ok === true) return { url: this.withAid(path), exact: true };
      // Site injoignable ou qui refuse notre serveur : on ne peut rien
      // confirmer. Hors États-Unis, le format est régulier, on le donne ;
      // sinon, l'accueil plutôt qu'un État deviné.
      if (ok === null) {
        return candidates.length === 1 ? { url: this.withAid(path), exact: true } : home;
      }
    }
    return home;
  }

  /**
   * `true` la page existe, `false` elle n'existe pas (404, ou redirection vers
   * une autre page), `null` impossible à savoir (réseau, blocage anti-robot).
   */
  private async pageExists(path: string): Promise<boolean | null> {
    const hit = this.checked.get(path);
    if (hit && Date.now() - hit.at < CHECK_TTL_MS) return hit.ok;

    let ok: boolean | null;
    try {
      const res = await fetch(`${BASE}${path}`, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YUMIA/1.0; +https://yumia.eu)' },
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      void res.body?.cancel().catch(() => undefined);
      const landed = new URL(res.url).pathname.replace(/\/+$/, '');
      if (res.status === 404 || res.status === 410) ok = false;
      else if (res.ok) ok = landed === path.replace(/\/+$/, '');
      else ok = null;
    } catch {
      ok = null;
    }
    // Un échec réseau n'est pas une réponse : on ne le garde pas en mémoire.
    if (ok === null) this.logger.warn(`Page Discover Cars non vérifiable : ${path}`);
    else this.checked.set(path, { ok, at: Date.now() });
    return ok;
  }
}
