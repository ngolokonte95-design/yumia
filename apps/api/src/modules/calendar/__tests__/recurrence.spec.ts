import { expandOccurrences, parseRRule } from '../recurrence';

const utc = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min));

/**
 * Fin de journée — les vues du calendrier interrogent toujours jusqu'à 23:59.
 * Utiliser minuit comme borne haute exclurait tous les événements de la
 * dernière journée de la fenêtre.
 */
const endOf = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

const HOUR = 3_600_000;
const iso = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 16));

describe('parseRRule', () => {
  it('analyse une règle complète', () => {
    const rule = parseRRule('FREQ=WEEKLY;INTERVAL=2;COUNT=5;BYDAY=MO,WE');
    expect(rule).toMatchObject({ freq: 'WEEKLY', interval: 2, count: 5, byDay: [1, 3] });
  });

  it('accepte le préfixe RRULE: et la casse libre', () => {
    expect(parseRRule('RRULE:freq=daily')).toMatchObject({ freq: 'DAILY', interval: 1 });
  });

  it('analyse UNTIL aux deux formats', () => {
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231T235959Z')?.until)
      .toEqual(new Date(Date.UTC(2026, 11, 31, 23, 59, 59)));
    // Format date seule : on prend la fin de journée pour inclure le jour.
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231')?.until?.getUTCHours()).toBe(23);
  });

  it('renvoie null sur une règle absente ou inexploitable', () => {
    expect(parseRRule(null)).toBeNull();
    expect(parseRRule('  ')).toBeNull();
    expect(parseRRule('FREQ=FORTNIGHTLY')).toBeNull();
    expect(parseRRule('INTERVAL=2')).toBeNull();
  });

  it('neutralise un intervalle invalide plutôt que de boucler à l\'infini', () => {
    expect(parseRRule('FREQ=DAILY;INTERVAL=0')?.interval).toBe(1);
    expect(parseRRule('FREQ=DAILY;INTERVAL=-3')?.interval).toBe(1);
    expect(parseRRule('FREQ=DAILY;INTERVAL=abc')?.interval).toBe(1);
  });
});

describe('expandOccurrences', () => {
  it('rend l\'événement ponctuel s\'il chevauche la fenêtre', () => {
    const start = utc(2026, 8, 5, 20);
    expect(expandOccurrences(start, HOUR, null, utc(2026, 8, 1), utc(2026, 8, 31)))
      .toEqual([start]);
    expect(expandOccurrences(start, HOUR, null, utc(2026, 9, 1), utc(2026, 9, 30)))
      .toEqual([]);
  });

  it('développe une règle quotidienne sur la fenêtre demandée', () => {
    const dates = expandOccurrences(
      utc(2026, 8, 1, 9), HOUR, parseRRule('FREQ=DAILY'),
      utc(2026, 8, 1), endOf(2026, 8, 5),
    );
    expect(iso(dates)).toEqual([
      '2026-08-01T09:00', '2026-08-02T09:00', '2026-08-03T09:00',
      '2026-08-04T09:00', '2026-08-05T09:00',
    ]);
  });

  it('respecte INTERVAL', () => {
    const dates = expandOccurrences(
      utc(2026, 8, 1, 9), HOUR, parseRRule('FREQ=DAILY;INTERVAL=3'),
      utc(2026, 8, 1), endOf(2026, 8, 10),
    );
    expect(iso(dates)).toEqual([
      '2026-08-01T09:00', '2026-08-04T09:00', '2026-08-07T09:00', '2026-08-10T09:00',
    ]);
  });

  it('arrête la série à UNTIL', () => {
    const dates = expandOccurrences(
      utc(2026, 8, 1, 9), HOUR, parseRRule('FREQ=DAILY;UNTIL=20260803T235959Z'),
      utc(2026, 8, 1), endOf(2026, 8, 31),
    );
    expect(dates).toHaveLength(3);
  });

  it('compte COUNT sur toute la série, pas seulement sur la fenêtre', () => {
    // La serie fait 5 occurrences a partir du 1er aout. En ne regardant que
    // les 3-10 aout, on ne doit voir que celles qui restent dans le quota —
    // sinon la fin de serie se decalerait selon le mois consulte.
    const dates = expandOccurrences(
      utc(2026, 8, 1, 9), HOUR, parseRRule('FREQ=DAILY;COUNT=5'),
      utc(2026, 8, 3), endOf(2026, 8, 10),
    );
    expect(iso(dates)).toEqual([
      '2026-08-03T09:00', '2026-08-04T09:00', '2026-08-05T09:00',
    ]);
  });

  it('développe une règle hebdomadaire avec BYDAY', () => {
    // 2026-08-03 est un lundi.
    const dates = expandOccurrences(
      utc(2026, 8, 3, 18), HOUR, parseRRule('FREQ=WEEKLY;BYDAY=MO,WE,FR'),
      utc(2026, 8, 3), endOf(2026, 8, 14),
    );
    expect(iso(dates)).toEqual([
      '2026-08-03T18:00', '2026-08-05T18:00', '2026-08-07T18:00',
      '2026-08-10T18:00', '2026-08-12T18:00', '2026-08-14T18:00',
    ]);
  });

  it('gère un anniversaire annuel', () => {
    const dates = expandOccurrences(
      utc(1995, 3, 17, 0), 86_400_000, parseRRule('FREQ=YEARLY'),
      utc(2026, 1, 1), endOf(2026, 12, 31),
    );
    expect(iso(dates)).toEqual(['2026-03-17T00:00']);
  });

  it('ne déborde pas sur le mois suivant pour un 31', () => {
    // 31 janvier + 1 mois : fevrier n'a pas de 31. Un setUTCMonth naif
    // donnerait le 2 ou 3 mars ; on veut le dernier jour de fevrier.
    const dates = expandOccurrences(
      utc(2026, 1, 31, 12), HOUR, parseRRule('FREQ=MONTHLY'),
      utc(2026, 1, 1), endOf(2026, 4, 30),
    );
    expect(iso(dates)).toEqual([
      '2026-01-31T12:00', '2026-02-28T12:00', '2026-03-31T12:00', '2026-04-30T12:00',
    ]);
  });

  it('gère le 29 février d\'une année bissextile', () => {
    const dates = expandOccurrences(
      utc(2024, 2, 29, 12), HOUR, parseRRule('FREQ=YEARLY'),
      utc(2025, 1, 1), endOf(2028, 12, 31),
    );
    // 2025-2027 ne sont pas bissextiles : on retombe sur le 28.
    expect(iso(dates)).toEqual([
      '2025-02-28T12:00', '2026-02-28T12:00', '2027-02-28T12:00', '2028-02-29T12:00',
    ]);
  });

  it('retire les occurrences exclues', () => {
    const dates = expandOccurrences(
      utc(2026, 8, 1, 9), HOUR, parseRRule('FREQ=DAILY'),
      utc(2026, 8, 1), endOf(2026, 8, 4),
      [utc(2026, 8, 2, 9), utc(2026, 8, 3, 9)],
    );
    expect(iso(dates)).toEqual(['2026-08-01T09:00', '2026-08-04T09:00']);
  });

  it('ne remonte jamais avant la première occurrence', () => {
    const dates = expandOccurrences(
      utc(2026, 8, 15, 9), HOUR, parseRRule('FREQ=DAILY'),
      utc(2026, 8, 1), endOf(2026, 8, 31),
    );
    expect(dates[0]).toEqual(utc(2026, 8, 15, 9));
  });

  it('retient un événement qui commence avant la fenêtre mais s\'y prolonge', () => {
    // Un vol de 12h parti la veille au soir doit apparaitre le lendemain.
    const dates = expandOccurrences(
      utc(2026, 8, 4, 22), 12 * HOUR, null,
      utc(2026, 8, 5), utc(2026, 8, 5, 23, 59),
    );
    expect(dates).toHaveLength(1);
  });

  it('reste borné face à une fenêtre absurde', () => {
    const dates = expandOccurrences(
      utc(2026, 1, 1), HOUR, parseRRule('FREQ=DAILY'),
      utc(2026, 1, 1), utc(2100, 1, 1),
    );
    // Le garde-fou coupe la generation : pas de boucle infinie ni d'explosion
    // memoire, meme si l'appelant demande 74 ans.
    expect(dates.length).toBeLessThanOrEqual(1000);
    expect(dates.length).toBeGreaterThan(300);
  });
});
