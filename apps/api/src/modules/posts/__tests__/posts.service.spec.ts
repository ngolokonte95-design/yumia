import { Test } from '@nestjs/testing';
import { PostsService } from '../posts.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * Couverture ciblée sur l'éditeur vidéo façon CapCut (overlays, son coupé,
 * voix off) — le reste du service, non touché ici, n'avait pas de tests
 * préexistants et n'entre pas dans le périmètre de ce changement.
 */
const makePrisma = () => ({
  post: { create: jest.fn() },
});

describe('PostsService — overlays / videoMuted / voiceTrackUrl', () => {
  let service: PostsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(PostsService);
    prisma.post.create.mockImplementation(({ data }: any) => ({ id: 'p1', ...data }));
  });

  it('persiste les overlays texte et dessin tels quels', async () => {
    const overlays = [
      { kind: 'text' as const, id: 'o1', x: 50, y: 20, text: 'Salut', color: '#fff', fontSize: 24 },
      { kind: 'draw' as const, id: 'o2', path: 'M10 10 L20 20', color: '#E5484D', strokeWidth: 4 },
    ];

    await service.createPost('u1', 'Légende', ['https://cdn/video.mp4'], { overlays });

    expect(prisma.post.create.mock.calls[0][0].data.overlays).toEqual(overlays);
  });

  it('n\'écrit pas d\'overlays quand aucun n\'est fourni', async () => {
    await service.createPost('u1', 'Légende', ['https://cdn/photo.jpg']);
    expect(prisma.post.create.mock.calls[0][0].data.overlays).toBeUndefined();
  });

  it('active videoMuted uniquement si explicitement demandé', async () => {
    await service.createPost('u1', 'X', ['https://cdn/video.mp4'], { videoMuted: true });
    expect(prisma.post.create.mock.calls[0][0].data.videoMuted).toBe(true);

    await service.createPost('u1', 'X', ['https://cdn/video.mp4']);
    expect(prisma.post.create.mock.calls[1][0].data.videoMuted).toBe(false);
  });

  it('persiste l\'URL de la voix off', async () => {
    await service.createPost('u1', 'X', ['https://cdn/video.mp4'], {
      voiceTrackUrl: 'https://cdn/voice.m4a',
    });
    expect(prisma.post.create.mock.calls[0][0].data.voiceTrackUrl).toBe('https://cdn/voice.m4a');
  });
});
