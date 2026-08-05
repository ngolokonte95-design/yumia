import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CalendarService } from '../calendar.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const utc = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h));

const event = (over: Partial<any> = {}): any => ({
  id: 'e1',
  userId: 'u1',
  title: 'Dîner',
  notes: null,
  category: 'restaurant',
  startAt: utc(2026, 8, 5, 20),
  endAt: utc(2026, 8, 5, 22),
  timezone: 'Europe/Paris',
  allDay: false,
  rrule: null,
  excludedDates: [],
  reminderMinutes: null,
  placeId: null,
  placeName: null,
  address: null,
  ...over,
});

const makePrisma = () => ({
  calendarEvent: {
    findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(),
    update: jest.fn(), delete: jest.fn(),
  },
});

describe('CalendarService', () => {
  let service: CalendarService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [CalendarService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CalendarService);
    prisma.calendarEvent.findMany.mockResolvedValue([]);
  });

  describe('list', () => {
    it('développe une série annuelle sur la fenêtre demandée', async () => {
      prisma.calendarEvent.findMany.mockResolvedValue([
        event({ title: 'Anniversaire', startAt: utc(1995, 3, 17), endAt: null, rrule: 'FREQ=YEARLY' }),
      ]);

      const items = await service.list('u1', utc(2026, 1, 1), utc(2026, 12, 31));

      expect(items).toHaveLength(1);
      expect(items[0].startAt).toBe(utc(2026, 3, 17).toISOString());
      expect(items[0].recurring).toBe(true);
    });

    it('donne à chaque occurrence une clé unique', async () => {
      prisma.calendarEvent.findMany.mockResolvedValue([
        event({ startAt: utc(2026, 8, 1, 9), endAt: null, rrule: 'FREQ=DAILY' }),
      ]);

      const items = await service.list('u1', utc(2026, 8, 1), utc(2026, 8, 3, 23));

      // Toute la série partage le même `id` : sans suffixe d'instant, les
      // occurrences auraient la même clé de liste côté mobile.
      expect(new Set(items.map((i) => i.id)).size).toBe(1);
      expect(new Set(items.map((i) => i.occurrenceId)).size).toBe(items.length);
    });

    it('conserve la durée sur chaque occurrence développée', async () => {
      prisma.calendarEvent.findMany.mockResolvedValue([
        event({ startAt: utc(2026, 8, 1, 20), endAt: utc(2026, 8, 1, 22), rrule: 'FREQ=DAILY' }),
      ]);

      const items = await service.list('u1', utc(2026, 8, 1), utc(2026, 8, 2, 23));
      const first = items[0];
      expect(new Date(first.endAt!).getTime() - new Date(first.startAt).getTime())
        .toBe(2 * 3_600_000);
    });

    it('charge les récurrents sans filtre de date, les ponctuels avec', async () => {
      await service.list('u1', utc(2026, 8, 1), utc(2026, 8, 31));

      const where = prisma.calendarEvent.findMany.mock.calls[0][0].where;
      // Une série démarrée en 1995 produit encore des occurrences aujourd'hui :
      // impossible de la filtrer sur startAt en SQL.
      expect(where.OR).toEqual([
        { rrule: null, startAt: { lte: utc(2026, 8, 31) } },
        { rrule: { not: null } },
      ]);
    });

    it('refuse une période inversée ou démesurée', async () => {
      await expect(service.list('u1', utc(2026, 8, 31), utc(2026, 8, 1)))
        .rejects.toThrow(BadRequestException);
      await expect(service.list('u1', utc(2020, 1, 1), utc(2030, 1, 1)))
        .rejects.toThrow(BadRequestException);
    });

    it('refuse des dates invalides', async () => {
      await expect(service.list('u1', new Date('n/a'), utc(2026, 8, 1)))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('normalise une catégorie inconnue en « personal »', async () => {
      prisma.calendarEvent.create.mockImplementation(({ data }: any) => ({ ...event(), ...data }));

      await service.create('u1', { title: 'Test', startAt: utc(2026, 8, 5).toISOString(), category: 'wat' });

      expect(prisma.calendarEvent.create.mock.calls[0][0].data.category).toBe('personal');
    });

    it('rejette une règle de récurrence invalide au lieu de la stocker', async () => {
      // Stockée telle quelle, elle produirait silencieusement un événement
      // ponctuel et l'utilisateur croirait sa série créée.
      await expect(service.create('u1', {
        title: 'Test', startAt: utc(2026, 8, 5).toISOString(), rrule: 'FREQ=FORTNIGHTLY',
      })).rejects.toThrow(BadRequestException);
    });

    it('rejette une fin antérieure au début', async () => {
      await expect(service.create('u1', {
        title: 'Test',
        startAt: utc(2026, 8, 5, 20).toISOString(),
        endAt: utc(2026, 8, 5, 18).toISOString(),
      })).rejects.toThrow(BadRequestException);
    });

    it('refuse un titre vide', async () => {
      await expect(service.create('u1', { title: '   ', startAt: utc(2026, 8, 5).toISOString() }))
        .rejects.toThrow(BadRequestException);
    });

    it('conserve le fuseau du lieu à côté de l\'instant UTC', async () => {
      prisma.calendarEvent.create.mockImplementation(({ data }: any) => ({ ...event(), ...data }));

      await service.create('u1', {
        title: 'Dîner à Tokyo',
        startAt: '2026-08-05T11:00:00.000Z',
        timezone: 'Asia/Tokyo',
      });

      const data = prisma.calendarEvent.create.mock.calls[0][0].data;
      // 11:00 UTC = 20:00 à Tokyo. L'instant et le fuseau sont stockés
      // séparément pour que l'heure murale reste juste depuis n'importe où.
      expect(data.startAt.toISOString()).toBe('2026-08-05T11:00:00.000Z');
      expect(data.timezone).toBe('Asia/Tokyo');
    });
  });

  describe('propriété', () => {
    it('interdit de modifier l\'événement d\'un autre', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue({ userId: 'autre' });
      await expect(service.update('u1', 'e1', { title: 'X' })).rejects.toThrow(ForbiddenException);
    });

    it('signale un événement inexistant', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue(null);
      await expect(service.remove('u1', 'e1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeOccurrence', () => {
    it('exclut une seule date sans supprimer la série', async () => {
      prisma.calendarEvent.findUnique.mockResolvedValue({ userId: 'u1' });

      await service.removeOccurrence('u1', 'e1', '2026-08-05T20:00:00.000Z');

      // Annuler un rendez-vous récurrent une fois ne doit pas détruire la série.
      expect(prisma.calendarEvent.delete).not.toHaveBeenCalled();
      expect(prisma.calendarEvent.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { excludedDates: { push: new Date('2026-08-05T20:00:00.000Z') } },
      });
    });
  });

  describe('search', () => {
    it('ne requête pas la base sur une recherche vide', async () => {
      expect(await service.search('u1', '  ')).toEqual([]);
      expect(prisma.calendarEvent.findMany).not.toHaveBeenCalled();
    });

    it('cherche dans le titre, les notes et le lieu', async () => {
      prisma.calendarEvent.findMany.mockResolvedValue([event()]);
      await service.search('u1', 'sushi');

      const or = prisma.calendarEvent.findMany.mock.calls[0][0].where.OR;
      expect(or).toHaveLength(3);
      expect(or[0].title.mode).toBe('insensitive');
    });
  });
});
