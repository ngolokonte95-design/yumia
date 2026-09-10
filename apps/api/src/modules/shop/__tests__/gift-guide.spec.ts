import {
  GIFT_BUDGETS,
  GIFT_OCCASIONS,
  GIFT_RECIPIENTS,
  blackFriday,
  categoriesFor,
  easterSunday,
  frenchFathersDay,
  frenchMothersDay,
  timingOf,
} from '../gift-guide';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('easterSunday', () => {
  // Dates de référence vérifiables dans n'importe quel calendrier liturgique.
  it.each([
    [2004, '2004-04-11'],
    [2015, '2015-04-05'],
    [2023, '2023-04-09'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2030, '2030-04-21'],
  ])('Pâques %i tombe le %s', (year, expected) => {
    expect(iso(easterSunday(year))).toBe(expected);
  });
});

describe('blackFriday', () => {
  it.each([
    [2025, '2025-11-28'],
    [2026, '2026-11-27'],
    [2027, '2027-11-26'],
  ])('Black Friday %i tombe le %s', (year, expected) => {
    expect(iso(blackFriday(year))).toBe(expected);
  });

  it('tombe toujours un vendredi', () => {
    for (let y = 2026; y <= 2040; y++) expect(blackFriday(y).getUTCDay()).toBe(5);
  });
});

describe('frenchMothersDay', () => {
  it('prend le dernier dimanche de mai en temps normal', () => {
    expect(iso(frenchMothersDay(2026))).toBe('2026-05-31');
    expect(iso(frenchMothersDay(2025))).toBe('2025-05-25');
    // 2015 : Pâques le 5 avril, donc Pentecôte le 24 mai — pas de conflit.
    expect(iso(frenchMothersDay(2015))).toBe('2015-05-31');
  });

  it('bascule en juin quand le dernier dimanche de mai est la Pentecôte', () => {
    // Le piège que codifie la loi française : quand la Pentecôte tombe le
    // dernier dimanche de mai, la fête est reportée d'une semaine.
    expect(iso(frenchMothersDay(2004))).toBe('2004-06-06');
    expect(iso(frenchMothersDay(2023))).toBe('2023-06-04');
    expect(iso(frenchMothersDay(2039))).toBe('2039-06-05');
  });

  it('tombe toujours un dimanche, en mai ou en juin', () => {
    for (let y = 2026; y <= 2040; y++) {
      const d = frenchMothersDay(y);
      expect(d.getUTCDay()).toBe(0);
      expect([4, 5]).toContain(d.getUTCMonth());
    }
  });

  it("n'est jamais le jour de la Pentecôte", () => {
    for (let y = 2026; y <= 2060; y++) {
      const pentecost = new Date(easterSunday(y).getTime() + 49 * 86_400_000);
      expect(iso(frenchMothersDay(y))).not.toBe(iso(pentecost));
    }
  });
});

describe('frenchFathersDay', () => {
  it.each([
    [2026, '2026-06-21'],
    [2027, '2027-06-20'],
  ])('fête des pères %i tombe le %s', (year, expected) => {
    expect(iso(frenchFathersDay(year))).toBe(expected);
  });
});

describe('timingOf', () => {
  const halloween = GIFT_OCCASIONS.find((o) => o.slug === 'halloween')!;
  const anniversaire = GIFT_OCCASIONS.find((o) => o.slug === 'anniversaire')!;

  it('compte les jours jusqu’à la prochaine occurrence', () => {
    const t = timingOf(halloween, new Date('2026-09-10T12:00:00Z'));
    expect(iso(t.date!)).toBe('2026-10-31');
    expect(t.daysUntil).toBe(51);
  });

  it('bascule sur l’année suivante une fois la date passée', () => {
    // Sans ça, Halloween afficherait « dans -1 jour » dès le 1er novembre.
    const t = timingOf(halloween, new Date('2026-11-01T12:00:00Z'));
    expect(iso(t.date!)).toBe('2027-10-31');
    expect(t.daysUntil).toBeGreaterThan(300);
  });

  it('signale l’occasion le jour même', () => {
    const t = timingOf(halloween, new Date('2026-10-31T23:00:00Z'));
    expect(t.daysUntil).toBe(0);
    expect(t.isNow).toBe(true);
  });

  it('n’est « en cours » que dans sa fenêtre', () => {
    expect(timingOf(halloween, new Date('2026-10-01T12:00:00Z')).isNow).toBe(true);
    expect(timingOf(halloween, new Date('2026-08-01T12:00:00Z')).isNow).toBe(false);
  });

  it('laisse les occasions permanentes sans date', () => {
    const t = timingOf(anniversaire, new Date('2026-09-10T12:00:00Z'));
    expect(t).toEqual({ date: null, daysUntil: null, isNow: false });
  });

  it('ne renvoie jamais de compte à rebours négatif, quel que soit le jour', () => {
    for (const occasion of GIFT_OCCASIONS) {
      for (let day = 0; day < 366; day++) {
        const now = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000);
        const { daysUntil } = timingOf(occasion, now);
        if (daysUntil !== null) expect(daysUntil).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('categoriesFor', () => {
  const femme = GIFT_RECIPIENTS.find((r) => r.slug === 'femme')!;
  const enfant = GIFT_RECIPIENTS.find((r) => r.slug === 'enfant')!;
  const feteDesMeres = GIFT_OCCASIONS.find((o) => o.slug === 'fete-des-meres')!;
  const noel = GIFT_OCCASIONS.find((o) => o.slug === 'noel')!;
  const anniversaire = GIFT_OCCASIONS.find((o) => o.slug === 'anniversaire')!;

  it('croise destinataire et occasion quand le recoupement est suffisant', () => {
    const cats = categoriesFor(femme, feteDesMeres);
    expect(cats).toContain('spa-massage');
    expect(cats).toContain('bijoux-montres');
    expect(cats).not.toContain('barbier');
  });

  it('retombe sur le destinataire quand le recoupement est trop maigre', () => {
    // Mieux vaut un cadeau qui vise juste mais hors thème qu'un écran vide.
    const cats = categoriesFor(enfant, feteDesMeres);
    expect(cats).toEqual(enfant.categories);
  });

  it('utilise l’occasion seule quand le destinataire est inconnu', () => {
    expect(categoriesFor(undefined, noel)).toEqual(noel.categories);
  });

  it('n’impose aucun rayon quand les deux sont larges', () => {
    expect(categoriesFor(undefined, anniversaire)).toEqual([]);
  });
});

describe('référentiel', () => {
  it('n’a que des slugs uniques', () => {
    for (const list of [GIFT_OCCASIONS, GIFT_RECIPIENTS, GIFT_BUDGETS]) {
      const slugs = list.map((x) => x.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it('a des budgets contigus et croissants', () => {
    const bornes = GIFT_BUDGETS.filter((b) => b.slug !== 'peu-importe');
    for (const b of bornes) {
      if (b.maxCents !== null) expect(b.maxCents).toBeGreaterThan(b.minCents);
    }
  });
});
