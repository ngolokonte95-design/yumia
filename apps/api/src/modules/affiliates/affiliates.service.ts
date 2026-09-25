import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { Universe } from '@yumia/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { PlacesService } from '../places/places.service';
import type { AffiliateProvider, AffiliateProviderKey } from './providers/affiliate-provider.interface';
import { BookingProvider } from './providers/booking.provider';
import { GetYourGuideProvider } from './providers/getyourguide.provider';
import { ViatorProvider } from './providers/viator.provider';
import { DiscoverCarsProvider } from './providers/discovercars.provider';
import { isRelevant, passesQuickFilters, queryWords, titleMatches, type QuickFilter } from './tour-relevance';
import { providersForUniverse, UNIVERSE_AFFILIATE_PROVIDERS } from './universe-provider-map';

/**
 * Onglets génériques d'Explorer ("Réserver une activité", "Transfert
 * aéroport"...) — pas de lieu ciblé, juste un lien tracké vers le partenaire
 * (page d'accueil, ou recherche pré-remplie par thème).
 *
 * `requiresEnvFlag` : interrupteur additionnel, indépendant de
 * `provider.isConfigured()` (qui ne vérifie que la présence de la clé/AID).
 * Utile pour Booking.com : l'AID est déjà configuré dans `.env.prod` mais
 * l'inscription est encore "en attente" côté CJ Affiliate — tant que ce flag
 * n'est pas à 'true', ces catégories restent invisibles (createGenericLink
 * renvoie null, comme si le provider n'était pas configuré), même si l'AID
 * est déjà présent. Pas d'impact sur Bons Plans/booking-link (place.tsx),
 * qui continuent de suivre uniquement isConfigured() comme avant.
 */
const GENERIC_CATEGORIES: Record<string, { provider: AffiliateProviderKey; searchTerm?: string; requiresEnvFlag?: string }> = {
  activities: { provider: 'getyourguide' },
  skip_the_line: { provider: 'viator', searchTerm: 'skip the line' },
  food_tours: { provider: 'getyourguide', searchTerm: 'food tour' },
  hop_on_hop_off: { provider: 'viator', searchTerm: 'hop-on hop-off' },
  airport_transfer: { provider: 'viator', searchTerm: 'airport transfer' },
  adventure: { provider: 'getyourguide', searchTerm: 'outdoor adventure' },
  shows: { provider: 'getyourguide', searchTerm: 'show' },
  // Ouverts sans attendre l'approbation Booking.com via CJ : le lien fonctionne
  // même sans identifiant d'affilié (voir BookingProvider.generateGenericLink),
  // il devient simplement rémunéré le jour où BOOKING_AFFILIATE_ID est
  // renseigné. `requiresEnvFlag` reste disponible pour un futur partenaire à
  // masquer, mais plus aucun rayon ne l'utilise.
  hotel: { provider: 'booking' },
  // Discover Cars depuis le 23/09/2026 (compte affilié « yumia » validé) :
  // l'onglet ouvre un écran de choix de ville, voir carRentalLink.
  car_rental: { provider: 'discovercars' },
  flights: { provider: 'booking', searchTerm: 'flights' },
};
export type GenericDealCategory = keyof typeof GENERIC_CATEGORIES;

/**
 * Thèmes de l'écran de visites (Visites guidées et 7 onglets « Réserve chez
 * nos partenaires »). [terme français, terme anglais] pour la recherche plein
 * texte de Viator ; `null` = le meilleur de la ville, sans filtre de sujet.
 */
export const TOUR_THEMES = {
  guides: ['visite guidée', 'guided tour'],
  activities: null,
  skip_the_line: ['coupe-file', 'skip the line'],
  food_tours: ['visite gastronomique', 'food tour'],
  hop_on_hop_off: ['bus touristique', 'hop-on hop-off'],
  airport_transfer: ['transfert aéroport', 'airport transfer'],
  adventure: ['aventure', 'outdoor adventure'],
  shows: ['spectacle', 'show'],
} as const satisfies Record<string, readonly [string, string] | null>;
export type TourTheme = keyof typeof TOUR_THEMES;

/**
 * Sous-filtres d'un thème (puces sous la barre de ville). Même principe :
 * [terme français, terme anglais] pour la recherche plein texte de Viator.
 * Clés reprises telles quelles par le mobile (lib/tour-themes.ts).
 */
export const THEME_FACETS: Partial<Record<TourTheme, Record<string, readonly [string, string]>>> = {
  guides: {
    walking: ['visite à pied', 'walking tour'],
    bike: ['visite à vélo', 'bike tour'],
    boat: ['visite en bateau', 'boat tour'],
    night: ['visite de nuit', 'night tour'],
    private: ['visite privée', 'private tour'],
    mystery: ['visite insolite', 'mystery tour'],
    street_art: ['street art', 'street art'],
    photo: ['visite photo', 'photo tour'],
  },
  adventure: {
    hiking: ['randonnée', 'hiking'],
    kayak: ['kayak', 'kayak'],
    // « plongée » seul remontait tout texte contenant le mot (« plongée dans
    // l'histoire ») : le terme plus large cible les activités nautiques.
    water_sports: ['sports nautiques', 'water sports'],
    paragliding: ['parapente', 'paragliding'],
    quad: ['quad buggy', 'atv tour'],
    climbing: ['escalade', 'climbing'],
    horse: ['équitation', 'horseback riding'],
    rafting: ['rafting', 'white water rafting'],
    snow: ['ski', 'ski'],
    jet_ski: ['jet ski', 'jet ski'],
  },
  food_tours: {
    wine: ['dégustation de vin', 'wine tasting'],
    cooking: ['cours de cuisine', 'cooking class'],
    street_food: ['street food', 'street food'],
    market: ['visite du marché', 'market tour'],
    chocolate: ['chocolat', 'chocolate'],
    cheese: ['dégustation de fromage', 'cheese tasting'],
    home_meal: ['repas chez l\'habitant', 'dinner with locals'],
    coffee: ['café', 'coffee tour'],
  },
  activities: {
    family: ['en famille', 'family friendly'],
    cruise: ['croisière', 'cruise'],
    day_trip: ['excursion d\'une journée', 'day trip'],
    workshop: ['atelier', 'workshop'],
    museum: ['musée', 'museum'],
    spa: ['spa', 'spa'],
    zoo: ['zoo aquarium', 'zoo aquarium'],
    theme_park: ['parc d\'attractions', 'theme park'],
  },
  shows: {
    nightlife: ['boîte de nuit', 'nightclub'],
    cabaret: ['cabaret', 'cabaret'],
    concert: ['concert', 'concert'],
    comedy: ['spectacle humour', 'comedy show'],
    theatre: ['théâtre', 'theater'],
    musical: ['comédie musicale', 'musical'],
    dinner_cruise: ['dîner croisière', 'dinner cruise'],
    pub_crawl: ['tournée des bars', 'pub crawl'],
    dance: ['spectacle de danse', 'dance show'],
    opera: ['opéra', 'opera'],
  },
};

export function isThemeFacet(theme: TourTheme, facet: string): boolean {
  const facets = THEME_FACETS[theme];
  return !!facets && Object.prototype.hasOwnProperty.call(facets, facet);
}

export function isTourTheme(v: string): v is TourTheme {
  return Object.prototype.hasOwnProperty.call(TOUR_THEMES, v);
}

function categoryEnabled(spec: { requiresEnvFlag?: string }): boolean {
  return !spec.requiresEnvFlag || process.env[spec.requiresEnvFlag] === 'true';
}

/** Durée de vie d'une vérification de fiche partenaire (7 jours). */
const VERIFY_LISTING_CACHE_SECONDS = 7 * 24 * 3600;

/** Taille maximale du `raw` d'une conversion stockée (~10 Ko). */
const CONVERSION_RAW_MAX_BYTES = 10_000;

/**
 * Le webhook est public : un corps de plusieurs Mo finissait tel quel en
 * base. Au-delà de ~10 Ko, on garde un extrait tronqué (chaîne) et un marqueur.
 */
export function boundRawPayload(payload: unknown): unknown {
  let json: string;
  try {
    json = JSON.stringify(payload ?? null) ?? 'null';
  } catch {
    return { truncated: true, excerpt: '' };
  }
  if (Buffer.byteLength(json, 'utf8') <= CONVERSION_RAW_MAX_BYTES) return payload ?? null;
  return { truncated: true, excerpt: json.slice(0, CONVERSION_RAW_MAX_BYTES) };
}

@Injectable()
export class AffiliatesService {
  private readonly providers: Map<AffiliateProviderKey, AffiliateProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly places: PlacesService,
    booking: BookingProvider,
    getyourguide: GetYourGuideProvider,
    private readonly viator: ViatorProvider,
    private readonly discovercars: DiscoverCarsProvider,
    // Optionnel : sans Redis (tests), la vérification n'est simplement pas cachée.
    @Optional() private readonly redis?: RedisService,
  ) {
    // Chaque nouveau partenaire (Fever, Treatwell, Trainline...) s'ajoute
    // simplement ici une fois son provider implémenté — le mapping univers →
    // provider et le reste du flux (clic, stats) ne changent pas.
    this.providers = new Map<AffiliateProviderKey, AffiliateProvider>([
      [booking.key, booking],
      [getyourguide.key, getyourguide],
      [viator.key, viator],
      [discovercars.key, discovercars],
    ]);
  }

  async universeOf(placeId: string): Promise<string | null> {
    const place = await this.prisma.place.findUnique({ where: { id: placeId }, select: { universe: true } });
    return place?.universe ?? null;
  }

  /** Providers pertinents pour un univers, avec leur disponibilité réelle (clé configurée ou non). */
  availableProviders(universe: string | null | undefined) {
    return providersForUniverse(universe).map((key) => ({
      key,
      configured: this.providers.get(key)?.isConfigured() ?? false,
    }));
  }

  /**
   * Comme `availableProviders`, mais ne garde que les providers dont
   * `verifyListing` confirme (quand implémenté) qu'une fiche existe vraiment
   * pour CE lieu — évite d'afficher un bouton "Réserver" qui retombe sur une
   * recherche sans rapport. Un provider sans `verifyListing` (pas encore
   * d'accès à l'API de recherche du partenaire) reste inclus tel quel.
   *
   * `dealsOnly` : réservé à Bons Plans (getNearbyDeals) — un partenaire dont
   * `hasWorkingVerification()` répond explicitement `false` (clé absente,
   * donc `verifyListing` ne ferait que laisser passer par défaut) est exclu
   * ici, même s'il resterait inclus ailleurs (fiche lieu, onglets génériques).
   * Sans ce garde-fou, un seul partenaire réellement vérifié (ex. Viator)
   * suffisait à valider un lieu, mais un partenaire non-vérifiable (GetYourGuide
   * sans sa clé) validait TOUT par défaut et neutralisait la vérification —
   * exactement le bug remonté sur Bons Plans.
   */
  private async verifiedProviders(
    place: { name: string; city: string; universe: string },
    options?: { dealsOnly?: boolean },
  ): Promise<AffiliateProviderKey[]> {
    const candidates = this.availableProviders(place.universe).filter((p) => p.configured);
    const checks = await Promise.all(candidates.map(async (p) => {
      const provider = this.providers.get(p.key);
      if (options?.dealsOnly && provider?.hasWorkingVerification?.() === false) return null;
      const ok = provider?.verifyListing ? await this.cachedVerifyListing(provider, place) : true;
      return ok ? p.key : null;
    }));
    return checks.filter((k): k is AffiliateProviderKey => k !== null);
  }

  /**
   * `verifyListing` avec cache Redis de 7 jours (clé : partenaire + ville +
   * nom). Chaque ouverture de Bons Plans vérifiait jusqu'à 6 lieux × univers
   * × partenaires chez Viator/GetYourGuide ; une fiche partenaire n'apparaît
   * ni ne disparaît d'un jour à l'autre. Pas de cache quand le partenaire ne
   * peut pas vérifier (clé absente) : la réponse est gratuite, et la cacher
   * figerait « vérifié » après l'ajout de la clé.
   */
  private async cachedVerifyListing(
    provider: AffiliateProvider,
    place: { name: string; city: string },
  ): Promise<boolean> {
    const verify = () => provider.verifyListing!(place);
    if (!this.redis || provider.hasWorkingVerification?.() === false) return verify();
    const norm = (v: string) => (v ?? '').trim().toLowerCase();
    const digest = createHash('sha1').update(`${norm(place.city)}|${norm(place.name)}`).digest('hex');
    const key = `aff:verify:${provider.key}:${digest}`;
    const cached = await this.redis.getJson<boolean>(key).catch(() => null);
    if (typeof cached === 'boolean') return cached;
    const ok = await verify();
    await this.redis.setJson(key, ok, VERIFY_LISTING_CACHE_SECONDS).catch(() => undefined);
    return ok;
  }

  /** Partenaires connus de l'API (liste blanche du webhook de conversion). */
  isKnownProvider(key: string): key is AffiliateProviderKey {
    return this.providers.has(key as AffiliateProviderKey);
  }

  /** Pour la fiche d'un lieu — GET /places/:id/affiliate-providers. */
  async availableProvidersForPlace(placeId: string) {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { name: true, city: true, universe: true },
    });
    if (!place) return { providers: [] };
    const verifiedKeys = new Set(await this.verifiedProviders(place));
    return {
      providers: this.availableProviders(place.universe)
        .map((p) => ({ ...p, configured: p.configured && verifiedKeys.has(p.key) })),
    };
  }

  /** Génère un lien tracké, enregistre le clic, renvoie l'URL — ou null si le provider n'est pas encore prêt. */
  async createBookingLink(
    providerKey: AffiliateProviderKey,
    placeId: string,
    userId: string | undefined,
  ): Promise<string | null> {
    const provider = this.providers.get(providerKey);
    if (!provider) return null;

    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, name: true, city: true, lat: true, lng: true, universe: true },
    });
    if (!place) throw new NotFoundException('Lieu introuvable');

    const trackingId = randomUUID();
    const link = provider.generateBookingLink(place, trackingId);
    if (!link) return null;

    await this.prisma.affiliateClick.create({
      data: {
        id: trackingId,
        userId,
        placeId: place.id,
        universe: place.universe,
        provider: providerKey,
      },
    });

    return link;
  }

  /**
   * La liste des catégories génériques, avec leur disponibilité réelle.
   *
   * `configured` répond à la seule question qui compte côté mobile : « appuyer
   * sur cet onglet mènera-t-il quelque part ? ». On le mesure donc en
   * demandant au provider de produire un lien, plutôt qu'en interrogeant
   * `isConfigured()` — les deux ont divergé le jour où Booking.com a su
   * générer un lien générique sans identifiant d'affilié, et l'écart se
   * traduisait par trois onglets affichés qui ne faisaient rien.
   *
   * `generateGenericLink` est une pure construction d'URL chez les trois
   * providers : l'appeler ici ne déclenche aucun effet de bord.
   */
  genericCategories() {
    return Object.entries(GENERIC_CATEGORIES).map(([category, spec]) => ({
      category,
      provider: spec.provider,
      configured:
        categoryEnabled(spec) &&
        this.providers.get(spec.provider)?.generateGenericLink('preview', spec.searchTerm) != null,
    }));
  }

  /**
   * Lien tracké générique pour un onglet Explorer ("activities",
   * "airport_transfer"...) — voir GENERIC_CATEGORIES. Même mécanique de
   * tracking que createBookingLink, mais sans lieu (placeId/universe null).
   */
  /**
   * Écran « Visites guidées » : les visites les mieux notées de la ville chez
   * Viator, et toujours les liens de recherche des partenaires configurés —
   * seuls affichés quand Viator ne répond pas (clé absente, ville inconnue).
   *
   * Remplace les « guides locaux » : des personnes fictives, créées par un
   * script de démonstration, dont la réservation n'était transmise à personne.
   */
  /**
   * @param q     recherche libre (« bowling ») : remplace le filtre de style,
   *   pour ne pas se limiter à nos catégories.
   * @param page  pages de PAGE_SIZE offres Viator (« Voir plus »).
   * @param alt   `true` : poursuivre avec le terme anglais, si la page 1 y a
   *   basculé faute de résultat en français.
   */
  async guidedTours(
    city: string,
    userId: string | undefined,
    theme: TourTheme = 'guides',
    facet?: string,
    quick: readonly QuickFilter[] = [],
    q?: string,
    page = 1,
    alt = false,
  ) {
    const PAGE_SIZE = 50;
    const trackingId = randomUUID();
    const query = q?.trim();
    const terms: readonly [string, string] | null = query
      ? [query, query]
      : (facet && THEME_FACETS[theme]?.[facet]) || TOUR_THEMES[theme];
    const freeWords = query ? queryWords(query) : null;
    // Viator ordonne par ressemblance mais ne filtre pas : on ne garde que les
    // offres qui relèvent vraiment du thème ou de la recherche (voir
    // tour-relevance.ts), sur des pages larges pour qu'il en reste assez.
    const keep = (title: string) =>
      freeWords ? freeWords.length === 0 || titleMatches(title, freeWords) : isRelevant(title, theme, facet);
    const fetchPage = async (term?: string) => {
      const raw = (await this.viator.searchTours(city, trackingId, term, PAGE_SIZE, (page - 1) * PAGE_SIZE + 1)) ?? [];
      const tours = raw.filter((t) => keep(t.title)).filter((t) => passesQuickFilters(t, quick));
      // Page pleine chez Viator : il en reste probablement d'autres.
      return { tours, hasMore: raw.length === PAGE_SIZE && page < 10 };
    };
    // Terme français d'abord (titres demandés en français), anglais en repli :
    // tous les produits ne sont pas traduits chez Viator.
    let usedAlt = alt && !!terms?.[1];
    let result = await fetchPage(usedAlt ? terms![1] : terms?.[0]);
    if (page === 1 && result.tours.length === 0 && terms?.[1] && terms[1] !== terms[0]) {
      usedAlt = true;
      result = await fetchPage(terms[1]);
    }
    const tours = result.tours;
    const searchTerm = terms ? `${terms[0]} ${city}` : city;
    const links = (['getyourguide', 'viator'] as const).flatMap((key) => {
      const url = this.providers.get(key)?.generateGenericLink(trackingId, searchTerm);
      return url ? [{ provider: key, url }] : [];
    });
    if (tours.length > 0 || links.length > 0) {
      // Un clic par consultation : on ne sait pas ici laquelle sera ouverte,
      // mais le partenaire rapporte la conversion avec cet identifiant.
      await this.prisma.affiliateClick
        .create({ data: { id: trackingId, userId, provider: tours.length > 0 ? 'viator' : links[0].provider } })
        .catch(() => undefined);
    }
    return { city, tours, links, hasMore: result.hasMore, alt: usedAlt };
  }

  /**
   * Écran Location de voiture : page de la ville chez Discover Cars, ou leur
   * accueil si aucune page ville n'a pu être confirmée.
   */
  async carRentalLink(city: string, locale: string | undefined, userId: string | undefined) {
    const names = await this.viator.englishPlaceNames(city);
    const link = await this.discovercars.cityLink(names, locale);
    if (!link) return null;
    await this.prisma.affiliateClick
      .create({ data: { id: randomUUID(), userId, provider: 'discovercars' } })
      .catch(() => undefined);
    return link;
  }

  /** Autocomplétion de ville de l'écran Visites guidées. */
  suggestTourCities(q: string) {
    return this.viator.suggestCities(q);
  }

  async createGenericLink(category: string, userId: string | undefined): Promise<string | null> {
    const spec = GENERIC_CATEGORIES[category];
    if (!spec || !categoryEnabled(spec)) return null;
    const provider = this.providers.get(spec.provider);
    if (!provider) return null;

    const trackingId = randomUUID();
    const link = provider.generateGenericLink(trackingId, spec.searchTerm);
    if (!link) return null;

    await this.prisma.affiliateClick.create({
      data: { id: trackingId, userId, provider: spec.provider },
    });

    return link;
  }

  /** Webhook générique de conversion — accepte le payload brut, tente d'en extraire un montant. */
  async recordConversion(providerKey: string, payload: unknown) {
    const provider = this.providers.get(providerKey as AffiliateProviderKey);
    const parsed = provider?.parseConversion?.(payload) ?? null;

    let clickId: string | undefined;
    if (parsed?.clickTrackingId) {
      const click = await this.prisma.affiliateClick.findUnique({ where: { id: parsed.clickTrackingId } });
      if (click) clickId = click.id;
    }

    await this.prisma.affiliateConversion.create({
      data: {
        provider: providerKey,
        clickId,
        amountCents: parsed?.amountCents,
        currency: parsed?.currency,
        raw: boundRawPayload(payload) as never,
      },
    });
  }

  /**
   * Alimente l'onglet "Bons plans" — lieux proches dont l'univers a au moins
   * un partenaire d'affiliation *configuré*. Interroge chaque univers
   * éligible séparément (et non un `nearby` global) pour garantir une
   * représentation de chaque catégorie (hôtels, activités, bien-être...)
   * plutôt que d'être noyé par l'univers le plus dense localement.
   */
  async getNearbyDeals(params: { lat: number; lng: number; radius: number }) {
    const configuredUniverses = Object.entries(UNIVERSE_AFFILIATE_PROVIDERS)
      .filter(([, keys]) => keys.some((k) => this.providers.get(k)?.isConfigured()))
      .map(([universe]) => universe as Universe);

    const perUniverse = await Promise.all(
      configuredUniverses.map(async (universe) => {
        const places = await this.places.nearby({ ...params, universe, limit: 6 }).catch(() => []);
        const withProviders = await Promise.all(places.map(async (p) => ({
          ...p,
          affiliateProviders: await this.verifiedProviders({ name: p.name, city: p.city, universe }, { dealsOnly: true }),
        })));
        // Un lieu dont AUCUN provider ne survit à la vérification n'a plus sa
        // place dans "Bons plans" — c'était exactement le cas signalé
        // (lieux affichés sans fiche réelle chez le partenaire).
        return withProviders.filter((p) => p.affiliateProviders.length > 0);
      }),
    );

    return perUniverse
      .flat()
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 40);
  }

  // ── Dashboard admin ─────────────────────────────────────────────────────

  async getStats() {
    const [clicksByProvider, conversionsByProvider, clicksByUniverse, totalClicks, totalConversions, revenue] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ provider: string; count: bigint }>>`
          SELECT "provider", COUNT(*)::bigint as count FROM "AffiliateClick" GROUP BY "provider" ORDER BY count DESC
        `,
        this.prisma.$queryRaw<Array<{ provider: string; count: bigint }>>`
          SELECT "provider", COUNT(*)::bigint as count FROM "AffiliateConversion" GROUP BY "provider" ORDER BY count DESC
        `,
        this.prisma.$queryRaw<Array<{ universe: string | null; count: bigint }>>`
          SELECT "universe"::text as universe, COUNT(*)::bigint as count FROM "AffiliateClick"
          WHERE "universe" IS NOT NULL GROUP BY "universe" ORDER BY count DESC
        `,
        this.prisma.affiliateClick.count(),
        this.prisma.affiliateConversion.count(),
        this.prisma.affiliateConversion.aggregate({ _sum: { amountCents: true } }),
      ]);

    return {
      totalClicks,
      totalConversions,
      conversionRate: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 1000) / 10 : 0,
      revenueCents: revenue._sum.amountCents ?? 0,
      clicksByProvider: clicksByProvider.map((r) => ({ provider: r.provider, count: Number(r.count) })),
      conversionsByProvider: conversionsByProvider.map((r) => ({ provider: r.provider, count: Number(r.count) })),
      clicksByUniverse: clicksByUniverse.map((r) => ({ universe: r.universe ?? '?', count: Number(r.count) })),
    };
  }

  async getClicksTrend(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt")::text as date, COUNT(*)::bigint as count
      FROM "AffiliateClick"
      WHERE "createdAt" >= ${since}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }
}
