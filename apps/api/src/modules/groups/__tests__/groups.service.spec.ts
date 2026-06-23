import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GroupsService } from '../groups.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RecommendationsService } from '../../recommendations/recommendations.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockPlace = (id = 'place-1', overrides: Partial<any> = {}) => ({
  id,
  name: 'Le Bistrot',
  universe: 'restaurant',
  city: 'Paris',
  countryCode: 'FR',
  rating: 4.5,
  priceTier: 2,
  photoUrls: ['https://cdn.yumia.app/photo.jpg'],
  lat: 48.856,
  lng: 2.352,
  tags: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockMember = (userId: string, overrides: Partial<any> = {}) => ({
  id: `member-${userId}`,
  sessionId: 'session-1',
  userId,
  votes: {},
  joinedAt: new Date(),
  user: { displayName: `User ${userId}`, photoUrl: null },
  ...overrides,
});

const mockSession = (overrides: Partial<any> = {}) => ({
  id: 'session-1',
  inviteCode: 'ABCDEF',
  status: 'waiting',
  createdById: 'user-host',
  suggestions: [],
  decidedPlaceId: null,
  createdAt: new Date(),
  members: [mockMember('user-host')],
  ...overrides,
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

const prismaMock: any = {
  groupSession: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  groupMember: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  place: {
    findMany: jest.fn(),
  },
};

const recommendationsMock = {
  top3: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('GroupsService', () => {
  let service: GroupsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RecommendationsService, useValue: recommendationsMock },
      ],
    }).compile();

    service = module.get(GroupsService);
    jest.clearAllMocks();

    // Par défaut, toView appelle place.findMany → tableau vide si pas de suggestions
    prismaMock.place.findMany.mockResolvedValue([]);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('crée une session et retourne la vue avec le créateur comme membre', async () => {
      const session = mockSession();
      prismaMock.groupSession.findUnique.mockResolvedValue(null); // code disponible
      prismaMock.groupSession.create.mockResolvedValue(session);

      const result = await service.create('user-host');

      expect(prismaMock.groupSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: 'user-host',
            members: expect.objectContaining({ create: { userId: 'user-host' } }),
          }),
        }),
      );
      expect(result.id).toBe('session-1');
      expect(result.status).toBe('waiting');
      expect(result.members).toHaveLength(1);
      expect(result.members[0].userId).toBe('user-host');
    });

    it('génère un nouveau code si le premier est déjà utilisé', async () => {
      const session = mockSession();
      // Premier code déjà existant, deuxième libre
      prismaMock.groupSession.findUnique
        .mockResolvedValueOnce({ id: 'other' }) // collision
        .mockResolvedValueOnce(null);            // disponible
      prismaMock.groupSession.create.mockResolvedValue(session);

      await service.create('user-host');

      // Au moins 2 appels findUnique (collision + vérification libre)
      expect(prismaMock.groupSession.findUnique.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(prismaMock.groupSession.create).toHaveBeenCalledTimes(1);
    });

    it('la vue retournée a suggestions vide et scores vide', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(null);
      prismaMock.groupSession.create.mockResolvedValue(mockSession({ suggestions: [] }));

      const result = await service.create('user-host');

      expect(result.suggestions).toHaveLength(0);
      expect(result.scores).toHaveLength(0);
    });
  });

  // ── join ───────────────────────────────────────────────────────────────────

  describe('join', () => {
    it('lève NotFoundException si le code est invalide', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(null);

      await expect(service.join('user-2', 'XXXXXX')).rejects.toThrow(NotFoundException);
    });

    it('lève BadRequestException si la session est terminée', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(mockSession({ status: 'done' }));

      await expect(service.join('user-2', 'ABCDEF')).rejects.toThrow(BadRequestException);
    });

    it('ajoute un nouveau membre et retourne la session mise à jour', async () => {
      const initial = mockSession();
      const withNew = mockSession({ members: [mockMember('user-host'), mockMember('user-2')] });

      prismaMock.groupSession.findUnique
        .mockResolvedValueOnce(initial)   // join → findUnique par code
        .mockResolvedValueOnce(withNew);  // findSession après create

      prismaMock.groupMember.create.mockResolvedValue({});

      const result = await service.join('user-2', 'ABCDEF');

      expect(prismaMock.groupMember.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-2' }) }),
      );
      expect(result.members).toHaveLength(2);
    });

    it('ne crée pas de doublon si l\'utilisateur est déjà membre', async () => {
      const session = mockSession(); // membres : [user-host]
      prismaMock.groupSession.findUnique.mockResolvedValue(session);

      await service.join('user-host', 'ABCDEF');

      expect(prismaMock.groupMember.create).not.toHaveBeenCalled();
    });

    it('normalise le code en majuscules avant la recherche', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(null);

      await service.join('user-2', 'abcdef').catch(() => {});

      expect(prismaMock.groupSession.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { inviteCode: 'ABCDEF' } }),
      );
    });
  });

  // ── suggest ────────────────────────────────────────────────────────────────

  describe('suggest', () => {
    it('lève NotFoundException si la session est introuvable', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(null);

      await expect(service.suggest('user-host', 'no-session', 48.8, 2.3, 'fr')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lève ForbiddenException si l\'appelant n\'est pas l\'hôte', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(mockSession({ createdById: 'user-host' }));

      await expect(service.suggest('user-other', 'session-1', 48.8, 2.3, 'fr')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lève BadRequestException si la session n\'est pas en attente', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(mockSession({ status: 'voting' }));

      await expect(service.suggest('user-host', 'session-1', 48.8, 2.3, 'fr')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('appelle top3, stocke les placeIds et passe la session en voting', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(mockSession());
      recommendationsMock.top3.mockResolvedValue({
        suggestions: [
          { place: mockPlace('p1') },
          { place: mockPlace('p2') },
          { place: mockPlace('p3') },
        ],
        reason: 'Soirée idéale',
        generatedAtIso: new Date().toISOString(),
      });

      const votingSession = mockSession({
        status: 'voting',
        suggestions: ['p1', 'p2', 'p3'],
      });
      prismaMock.groupSession.update.mockResolvedValue(votingSession);
      prismaMock.place.findMany.mockResolvedValue([mockPlace('p1'), mockPlace('p2'), mockPlace('p3')]);

      const result = await service.suggest('user-host', 'session-1', 48.8, 2.3, 'fr');

      expect(recommendationsMock.top3).toHaveBeenCalledWith(
        expect.objectContaining({ lat: 48.8, lng: 2.3, radius: 3000 }),
      );
      expect(prismaMock.groupSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'voting', suggestions: ['p1', 'p2', 'p3'] }),
        }),
      );
      expect(result.status).toBe('voting');
      expect(result.suggestions).toHaveLength(3);
    });
  });

  // ── vote ───────────────────────────────────────────────────────────────────

  describe('vote', () => {
    const votingSession = () => mockSession({
      status: 'voting',
      suggestions: ['place-1', 'place-2'],
      members: [
        mockMember('user-host', { votes: {} }),
        mockMember('user-2', { votes: {} }),
      ],
    });

    const setupVoteHappyPath = () => {
      prismaMock.groupSession.findUnique
        .mockResolvedValueOnce(votingSession())   // premier findUnique dans vote()
        .mockResolvedValueOnce(votingSession());  // findSession après update

      prismaMock.groupMember.update.mockResolvedValue({});
      prismaMock.groupMember.findMany.mockResolvedValue([
        // user-host a voté uniquement sur place-1, user-2 n'a pas voté → pas auto-done
        mockMember('user-host', { votes: { 'place-1': 'like' } }),
        mockMember('user-2', { votes: {} }),
      ]);
    };

    it('lève NotFoundException si la session est introuvable', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(null);

      await expect(service.vote('user-host', 'no-session', 'place-1', 'like')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lève BadRequestException si le vote n\'est pas ouvert', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(mockSession({ status: 'waiting' }));

      await expect(service.vote('user-host', 'session-1', 'place-1', 'like')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lève ForbiddenException si l\'utilisateur n\'est pas membre', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(votingSession());

      await expect(service.vote('user-stranger', 'session-1', 'place-1', 'like')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('enregistre le vote du membre', async () => {
      setupVoteHappyPath();

      await service.vote('user-host', 'session-1', 'place-1', 'like');

      expect(prismaMock.groupMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'member-user-host' },
          data: { votes: { 'place-1': 'like' } },
        }),
      );
    });

    it('auto-décide quand tous les membres ont voté sur toutes les suggestions', async () => {
      // user-host a déjà voté sur place-1, il vote maintenant sur place-2 (dernier vote manquant)
      const sessionWithPartialVote = mockSession({
        status: 'voting',
        suggestions: ['place-1', 'place-2'],
        members: [
          mockMember('user-host', { votes: { 'place-1': 'like' } }), // a déjà voté place-1
          mockMember('user-2', { votes: { 'place-1': 'like', 'place-2': 'like' } }), // complet
        ],
      });

      prismaMock.groupSession.findUnique
        .mockResolvedValueOnce(sessionWithPartialVote)
        .mockResolvedValueOnce(mockSession({ status: 'done', decidedPlaceId: 'place-1' }));

      prismaMock.groupMember.update.mockResolvedValue({});
      // findMany retourne l'état DB (user-host encore incomplet côté DB, mais le service
      // utilise updatedVotes = { place-1: like, place-2: dislike } pour user-host)
      prismaMock.groupMember.findMany.mockResolvedValue([
        mockMember('user-host', { votes: { 'place-1': 'like' } }),
        mockMember('user-2', { votes: { 'place-1': 'like', 'place-2': 'like' } }),
      ]);
      prismaMock.groupSession.update.mockResolvedValue({});

      const result = await service.vote('user-host', 'session-1', 'place-2', 'dislike');

      expect(prismaMock.groupSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'done', decidedPlaceId: expect.any(String) }),
        }),
      );
      expect(result.status).toBe('done');
    });

    it('choisit le lieu avec le plus de likes comme gagnant', async () => {
      // user-2 vote sur place-2 (son dernier vote) — user-host est déjà complet
      // place-1: 0 likes, place-2: 2 likes → winner = place-2
      const sessionHostComplete = mockSession({
        status: 'voting',
        suggestions: ['place-1', 'place-2'],
        members: [
          mockMember('user-host', { votes: { 'place-1': 'dislike', 'place-2': 'like' } }),
          mockMember('user-2', { votes: { 'place-1': 'dislike' } }), // vote place-2 manquant
        ],
      });

      prismaMock.groupSession.findUnique
        .mockResolvedValueOnce(sessionHostComplete)
        .mockResolvedValueOnce(mockSession({ status: 'done', decidedPlaceId: 'place-2' }));

      prismaMock.groupMember.update.mockResolvedValue({});
      prismaMock.groupMember.findMany.mockResolvedValue([
        mockMember('user-host', { votes: { 'place-1': 'dislike', 'place-2': 'like' } }),
        mockMember('user-2', { votes: { 'place-1': 'dislike' } }), // updatedVotes sera { place-1: dislike, place-2: like }
      ]);
      prismaMock.groupSession.update.mockResolvedValue({});

      const result = await service.vote('user-2', 'session-1', 'place-2', 'like');

      const updateCall = prismaMock.groupSession.update.mock.calls[0][0];
      expect(updateCall.data.decidedPlaceId).toBe('place-2');
      expect(result.decidedPlaceId).toBe('place-2');
    });

    it('ne décide pas tant que des votes manquent', async () => {
      setupVoteHappyPath();

      await service.vote('user-host', 'session-1', 'place-1', 'like');

      // groupSession.update ne doit pas être appelé (vote non complet)
      expect(prismaMock.groupSession.update).not.toHaveBeenCalled();
    });
  });

  // ── decide ─────────────────────────────────────────────────────────────────

  describe('decide', () => {
    it('lève NotFoundException si la session est introuvable', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(null);

      await expect(service.decide('user-host', 'no-session', 'place-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lève ForbiddenException si l\'appelant n\'est pas l\'hôte', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(mockSession({ createdById: 'user-host' }));

      await expect(service.decide('user-2', 'session-1', 'place-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('met la session en done avec le lieu choisi', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(mockSession());
      const doneSession = mockSession({ status: 'done', decidedPlaceId: 'place-1' });
      prismaMock.groupSession.update.mockResolvedValue(doneSession);

      const result = await service.decide('user-host', 'session-1', 'place-1');

      expect(prismaMock.groupSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'done', decidedPlaceId: 'place-1' },
        }),
      );
      expect(result.status).toBe('done');
      expect(result.decidedPlaceId).toBe('place-1');
    });
  });

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('lève NotFoundException si la session est introuvable', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(null);

      await expect(service.get('no-session', 'user-host')).rejects.toThrow(NotFoundException);
    });

    it('lève ForbiddenException si l\'utilisateur n\'est pas membre', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(mockSession()); // membre = user-host

      await expect(service.get('session-1', 'user-stranger')).rejects.toThrow(ForbiddenException);
    });

    it('retourne la vue pour un membre légitime', async () => {
      prismaMock.groupSession.findUnique.mockResolvedValue(mockSession());

      const result = await service.get('session-1', 'user-host');

      expect(result.id).toBe('session-1');
      expect(result.members[0].userId).toBe('user-host');
    });
  });

  // ── toView (via get) ───────────────────────────────────────────────────────

  describe('vue enrichie (toView)', () => {
    it('calcule correctement likes/dislikes/score par suggestion', async () => {
      const session = mockSession({
        status: 'voting',
        suggestions: ['place-1'],
        members: [
          mockMember('user-host', { votes: { 'place-1': 'like' } }),
          mockMember('user-2', { votes: { 'place-1': 'like' } }),
          mockMember('user-3', { votes: { 'place-1': 'dislike' } }),
        ],
      });
      prismaMock.groupSession.findUnique.mockResolvedValue(session);
      prismaMock.place.findMany.mockResolvedValue([mockPlace('place-1')]);

      const result = await service.get('session-1', 'user-host');

      const s = result.suggestions[0];
      expect(s.likes).toBe(2);
      expect(s.dislikes).toBe(1);
      expect(s.score).toBe(1);
    });

    it('expose le vote personnel de l\'utilisateur appelant (myVote)', async () => {
      const session = mockSession({
        status: 'voting',
        suggestions: ['place-1'],
        members: [
          mockMember('user-host', { votes: { 'place-1': 'like' } }),
        ],
      });
      prismaMock.groupSession.findUnique.mockResolvedValue(session);
      prismaMock.place.findMany.mockResolvedValue([mockPlace('place-1')]);

      const result = await service.get('session-1', 'user-host');

      expect(result.suggestions[0].myVote).toBe('like');
    });

    it('myVote = null si l\'utilisateur n\'a pas encore voté', async () => {
      const session = mockSession({
        status: 'voting',
        suggestions: ['place-1'],
        members: [mockMember('user-host', { votes: {} })],
      });
      prismaMock.groupSession.findUnique.mockResolvedValue(session);
      prismaMock.place.findMany.mockResolvedValue([mockPlace('place-1')]);

      const result = await service.get('session-1', 'user-host');

      expect(result.suggestions[0].myVote).toBeNull();
    });

    it('votedCount reflète le nombre de votes émis par le membre', async () => {
      const session = mockSession({
        status: 'voting',
        suggestions: ['place-1', 'place-2'],
        members: [
          mockMember('user-host', { votes: { 'place-1': 'like' } }), // voté 1/2
        ],
      });
      prismaMock.groupSession.findUnique.mockResolvedValue(session);
      prismaMock.place.findMany.mockResolvedValue([mockPlace('place-1'), mockPlace('place-2')]);

      const result = await service.get('session-1', 'user-host');

      expect(result.members[0].votedCount).toBe(1);
    });

    it('scores trié par score décroissant', async () => {
      const session = mockSession({
        status: 'voting',
        suggestions: ['place-1', 'place-2'],
        members: [
          mockMember('user-host', { votes: { 'place-1': 'dislike', 'place-2': 'like' } }),
          mockMember('user-2', { votes: { 'place-1': 'dislike', 'place-2': 'like' } }),
        ],
      });
      prismaMock.groupSession.findUnique.mockResolvedValue(session);
      prismaMock.place.findMany.mockResolvedValue([mockPlace('place-1'), mockPlace('place-2')]);

      const result = await service.get('session-1', 'user-host');

      expect(result.scores[0].placeId).toBe('place-2'); // 2 likes > place-1 -2
      expect(result.scores[0].score).toBeGreaterThan(result.scores[1].score);
    });
  });
});
