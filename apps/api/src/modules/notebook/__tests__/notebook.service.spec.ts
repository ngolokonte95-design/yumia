import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NotebookService } from '../notebook.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const note = (over: Partial<any> = {}): any => ({
  id: 'n1',
  userId: 'u1',
  title: 'Restos à tester',
  content: '',
  kind: 'checklist',
  items: [],
  updatedAt: new Date('2026-08-05T10:00:00Z'),
  ...over,
});

const makePrisma = () => ({
  notebookNote: {
    findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(),
    update: jest.fn(), delete: jest.fn(),
  },
});

describe('NotebookService', () => {
  let service: NotebookService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [NotebookService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(NotebookService);
    prisma.notebookNote.findMany.mockResolvedValue([]);
    prisma.notebookNote.create.mockImplementation(({ data }: any) => ({ ...note(), ...data }));
    prisma.notebookNote.update.mockImplementation(({ data }: any) => ({ ...note(), ...data }));
  });

  describe('list', () => {
    it('masque les archivées par défaut et épingle en tête', async () => {
      await service.list('u1');
      const args = prisma.notebookNote.findMany.mock.calls[0][0];
      expect(args.where.archived).toBe(false);
      expect(args.orderBy).toEqual([{ pinned: 'desc' }, { updatedAt: 'desc' }]);
    });

    it('cherche dans le titre, le contenu et le lieu', async () => {
      await service.list('u1', { query: 'sushi' });
      const or = prisma.notebookNote.findMany.mock.calls[0][0].where.OR;
      expect(or).toHaveLength(3);
    });

    it('borne le nombre de résultats', async () => {
      await service.list('u1', {}, 9999);
      expect(prisma.notebookNote.findMany.mock.calls[0][0].take).toBe(200);
    });

    it('filtre sur une journée entière, pas sur un instant', async () => {
      await service.list('u1', { date: '2026-08-05' });
      const range = prisma.notebookNote.findMany.mock.calls[0][0].where.noteDate;
      expect(range.gte.toISOString()).toBe('2026-08-05T00:00:00.000Z');
      expect(range.lte.toISOString()).toBe('2026-08-05T23:59:59.999Z');
    });

    it('rejette une date de filtre invalide', async () => {
      await expect(service.list('u1', { date: 'demain' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('refuse une note entièrement vide', async () => {
      await expect(service.create('u1', { title: '  ', content: '  ' }))
        .rejects.toThrow(BadRequestException);
    });

    it('accepte une checklist sans titre ni contenu', async () => {
      await service.create('u1', {
        kind: 'checklist',
        items: [{ id: 'a', text: 'Réserver', done: false }],
      });
      expect(prisma.notebookNote.create).toHaveBeenCalled();
    });

    it('écarte les éléments de checklist vides', async () => {
      await service.create('u1', {
        title: 'Courses',
        kind: 'checklist',
        items: [
          { id: 'a', text: 'Pain', done: false },
          { id: 'b', text: '   ', done: false },
          { id: 'c', text: 'Lait', done: true },
        ],
      });
      // Sans ce filtrage, une coche sans libellé s'ajouterait à chaque frappe.
      const items = prisma.notebookNote.create.mock.calls[0][0].data.items;
      expect(items).toHaveLength(2);
      expect(items.map((i: any) => i.text)).toEqual(['Pain', 'Lait']);
    });

    it('garantit un identifiant à chaque élément', async () => {
      await service.create('u1', {
        title: 'X', kind: 'checklist',
        items: [{ id: '', text: 'Sans id', done: false }] as never,
      });
      expect(prisma.notebookNote.create.mock.calls[0][0].data.items[0].id).toBeTruthy();
    });

    it('normalise un type inconnu en note libre', async () => {
      await service.create('u1', { title: 'X', kind: 'wat' as never });
      expect(prisma.notebookNote.create.mock.calls[0][0].data.kind).toBe('note');
    });
  });

  describe('update', () => {
    beforeEach(() => prisma.notebookNote.findUnique.mockResolvedValue(note()));

    it('ne touche que les champs fournis', async () => {
      await service.update('u1', 'n1', { title: 'Nouveau titre' });
      const data = prisma.notebookNote.update.mock.calls[0][0].data;
      expect(data).toHaveProperty('title', 'Nouveau titre');
      // Le contenu n'était pas fourni : il ne doit pas être écrasé par ''.
      expect(data).not.toHaveProperty('content');
    });

    it('signale une écriture concurrente sans la bloquer', async () => {
      // Le client editait une version anterieure a celle du serveur : on
      // applique quand meme (dernier ecrivain gagne) mais on le signale.
      const res = await service.update('u1', 'n1', {
        content: 'Depuis un autre appareil',
        knownUpdatedAt: '2026-08-05T09:00:00Z',
      });
      expect(res.staleWrite).toBe(true);
      expect(prisma.notebookNote.update).toHaveBeenCalled();
    });

    it('ne signale rien quand le client est à jour', async () => {
      const res = await service.update('u1', 'n1', {
        content: 'ok', knownUpdatedAt: '2026-08-05T10:00:00Z',
      });
      expect(res.staleWrite).toBe(false);
    });

    it('permet de détacher une date', async () => {
      await service.update('u1', 'n1', { noteDate: null });
      expect(prisma.notebookNote.update.mock.calls[0][0].data.noteDate).toBeNull();
    });
  });

  describe('propriété', () => {
    it('interdit d\'accéder à la note d\'un autre', async () => {
      prisma.notebookNote.findUnique.mockResolvedValue(note({ userId: 'autre' }));
      await expect(service.get('u1', 'n1')).rejects.toThrow(ForbiddenException);
    });

    it('signale une note inexistante', async () => {
      prisma.notebookNote.findUnique.mockResolvedValue(null);
      await expect(service.remove('u1', 'n1')).rejects.toThrow(NotFoundException);
    });
  });
});
