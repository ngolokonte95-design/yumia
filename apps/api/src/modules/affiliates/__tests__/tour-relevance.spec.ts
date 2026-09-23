import { FACET_MATCH, relevanceWords, THEME_MATCH, titleMatches } from '../tour-relevance';
import { THEME_FACETS, TOUR_THEMES } from '../affiliates.service';

describe('cohérence des résultats de visites', () => {
  it('écarte une offre qui ne relève pas du filtre choisi', () => {
    const theatre = relevanceWords('shows', 'theatre')!;
    expect(titleMatches('Croisière sur la Seine avec dîner', theatre)).toBe(false);
    expect(titleMatches('Billets pour une pièce de théâtre à la Comédie-Française', theatre)).toBe(true);
    expect(titleMatches('West End Theatre Tickets', theatre)).toBe(true);
  });

  it('compare sans accents et par début de mot', () => {
    expect(titleMatches('Visite à VÉLO de Paris', relevanceWords('guides', 'bike')!)).toBe(true);
    // « bar » ne doit pas reconnaître « Barcelone ».
    expect(titleMatches('Excursion à Barcelone', relevanceWords('shows', 'pub_crawl')!)).toBe(false);
  });

  it('ne contrôle pas les thèmes larges', () => {
    expect(relevanceWords('activities')).toBeNull();
    expect(relevanceWords('adventure')).toBeNull();
  });

  it('a des mots pour chaque filtre déclaré', () => {
    for (const [theme, facets] of Object.entries(THEME_FACETS)) {
      for (const facet of Object.keys(facets ?? {})) {
        expect(FACET_MATCH[theme]?.[facet]?.length).toBeGreaterThan(0);
      }
    }
    for (const theme of Object.keys(THEME_MATCH)) expect(theme in TOUR_THEMES).toBe(true);
  });
});
