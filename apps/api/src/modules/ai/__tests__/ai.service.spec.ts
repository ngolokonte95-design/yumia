import { Test } from '@nestjs/testing';
import { AiService } from '../ai.service';
import { AI_PROVIDER } from '../providers/ai-provider.interface';
import { ENGINE_REGISTRY } from '../engines/engine.registry';

// ── Mock factory ──────────────────────────────────────────────────────────────

const makeProvider = () => ({
  name: 'mock',
  complete: jest.fn<Promise<string>, [string, unknown]>().mockResolvedValue('Réponse IA'),
  completeStructured: jest.fn<Promise<unknown>, [string, unknown]>().mockResolvedValue({ reason: 'ok', universesSuggested: ['restaurant'] }),
});

// ── Context fixtures ──────────────────────────────────────────────────────────

const baseCtx = {
  userId: 'user-1',
  city: 'Paris',
  localTimeIso: '2026-06-22T20:00:00',
  locale: 'fr',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AiService', () => {
  let service: AiService;
  let provider: ReturnType<typeof makeProvider>;

  beforeEach(async () => {
    provider = makeProvider();

    const module = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: AI_PROVIDER, useValue: provider },
      ],
    }).compile();

    service = module.get(AiService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── run ───────────────────────────────────────────────────────────────────

  describe('run', () => {
    it('délègue au provider avec le prompt construit par le moteur', async () => {
      const result = await service.run('mood', baseCtx);

      expect(result).toBe('Réponse IA');
      expect(provider.complete).toHaveBeenCalledWith(
        expect.stringContaining('Paris'),
        expect.objectContaining({ tier: ENGINE_REGISTRY.mood.tier }),
      );
    });

    it('inclut le system prompt du moteur', async () => {
      await service.run('food', baseCtx);

      expect(provider.complete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ system: ENGINE_REGISTRY.food.system }),
      );
    });

    it('fonctionne pour tous les moteurs du registre', async () => {
      const engines = Object.keys(ENGINE_REGISTRY) as Array<keyof typeof ENGINE_REGISTRY>;

      for (const engine of engines) {
        jest.clearAllMocks();
        provider.complete.mockResolvedValue(`réponse-${engine}`);

        const result = await service.run(engine, baseCtx);

        expect(result).toBe(`réponse-${engine}`);
        expect(provider.complete).toHaveBeenCalledTimes(1);
      }
    });

    it('le prompt inclut l\'humeur quand elle est fournie dans le contexte', async () => {
      await service.run('mood', { ...baseCtx, mood: 'explore' });

      expect(provider.complete).toHaveBeenCalledWith(
        expect.stringContaining('explore'),
        expect.any(Object),
      );
    });

    it('le prompt inclut la météo quand elle est fournie dans le contexte', async () => {
      await service.run('weather', {
        ...baseCtx,
        weather: { condition: 'sunny', tempC: 28 },
      });

      expect(provider.complete).toHaveBeenCalledWith(
        expect.stringContaining('sunny'),
        expect.any(Object),
      );
    });
  });

  // ── freeChat ──────────────────────────────────────────────────────────────

  describe('freeChat', () => {
    it('appelle provider.complete avec system et userPrompt fournis', async () => {
      const result = await service.freeChat('Tu es un guide', 'Que faire ce soir ?');

      expect(result).toBe('Réponse IA');
      expect(provider.complete).toHaveBeenCalledWith(
        'Que faire ce soir ?',
        expect.objectContaining({ system: 'Tu es un guide' }),
      );
    });

    it('utilise le tier "smart" par défaut', async () => {
      await service.freeChat('system', 'prompt');

      expect(provider.complete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tier: 'smart' }),
      );
    });

    it('respecte le tier passé explicitement', async () => {
      await service.freeChat('system', 'prompt', 'fast');

      expect(provider.complete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tier: 'fast' }),
      );
    });

    it('fixe maxTokens à 400', async () => {
      await service.freeChat('system', 'prompt');

      expect(provider.complete).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxTokens: 400 }),
      );
    });
  });

  // ── runStructured ─────────────────────────────────────────────────────────

  describe('runStructured', () => {
    it('appelle provider.completeStructured et renvoie l\'objet parsé', async () => {
      const expected = { reason: 'parfait', universesSuggested: ['bar'] };
      provider.completeStructured.mockResolvedValue(expected);

      const result = await service.runStructured<typeof expected>('mood', baseCtx);

      expect(result).toEqual(expected);
      expect(provider.completeStructured).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ jsonSchema: ENGINE_REGISTRY.mood.jsonSchema }),
      );
    });

    it('lève une erreur si le moteur n\'a pas de jsonSchema', async () => {
      await expect(service.runStructured('date', baseCtx)).rejects.toThrow(
        /date.*schéma structuré/,
      );
      expect(provider.completeStructured).not.toHaveBeenCalled();
    });

    it('fonctionne avec le moteur experience_builder qui a un schéma complexe', async () => {
      const expected = {
        titleFr: 'Soirée parfaite',
        steps: [{ order: 1, labelFr: 'Apéro', universe: 'bar', reasonFr: 'Top.' }],
      };
      provider.completeStructured.mockResolvedValue(expected);

      const result = await service.runStructured<typeof expected>('experience_builder', baseCtx);

      expect(result).toEqual(expected);
    });
  });
});
