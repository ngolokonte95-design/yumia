import { MockProvider } from '../mock.provider';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MockProvider', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
    jest.spyOn(provider['logger'], 'debug').mockImplementation(() => undefined);
  });

  it('a le nom "mock"', () => {
    expect(provider.name).toBe('mock');
  });

  // ── complete ───────────────────────────────────────────────────────────────

  describe('complete', () => {
    it('retourne une réponse simulée déterministe incluant un extrait du prompt', async () => {
      const result = await provider.complete('Recommande un restaurant', { tier: 'smart' });

      expect(result).toContain('mock');
      expect(result).toContain('Recommande un restaurant');
    });

    it('tronque les prompts longs à 80 caractères', async () => {
      const longPrompt = 'a'.repeat(200);
      const result = await provider.complete(longPrompt, { tier: 'fast' });

      // Le mock prend les 80 premiers caractères du prompt
      expect(result).toContain('a'.repeat(80));
      expect(result).not.toContain('a'.repeat(81));
    });
  });

  // ── completeStructured ───────────────────────────────────────────────────────

  describe('completeStructured', () => {
    it('construit un objet conforme au schéma avec des valeurs neutres', async () => {
      const schema = {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          universesSuggested: { type: 'array', items: { type: 'string' } },
        },
        required: ['reason', 'universesSuggested'],
      };

      const result = await provider.completeStructured<{ reason: string; universesSuggested: string[] }>(
        'prompt',
        { tier: 'smart', jsonSchema: schema },
      );

      expect(result).toEqual({ reason: '', universesSuggested: [] });
    });

    it('gère les nombres, entiers et booléens', async () => {
      const schema = {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          score: { type: 'number' },
          active: { type: 'boolean' },
        },
      };

      const result = await provider.completeStructured<Record<string, unknown>>(
        'prompt',
        { tier: 'smart', jsonSchema: schema },
      );

      expect(result).toEqual({ count: 0, score: 0, active: false });
    });

    it('gère les objets imbriqués récursivement', async () => {
      const schema = {
        type: 'object',
        properties: {
          titleFr: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer' },
                labelFr: { type: 'string' },
              },
            },
          },
        },
      };

      const result = await provider.completeStructured<{ titleFr: string; steps: unknown[] }>(
        'prompt',
        { tier: 'smart', jsonSchema: schema },
      );

      expect(result).toEqual({ titleFr: '', steps: [] });
    });

    it('retourne une chaîne vide pour un type inconnu', async () => {
      const schema = { type: 'unknown_type' as unknown as string };

      const result = await provider.completeStructured('prompt', {
        tier: 'smart',
        jsonSchema: schema,
      });

      expect(result).toBe('');
    });
  });
});
