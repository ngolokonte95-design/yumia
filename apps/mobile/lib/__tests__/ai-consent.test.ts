import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetAiConsentForTests,
  aiConsentHeaders,
  ensureAiConsent,
  getAiConsent,
  registerAiConsentPresenter,
  setAiConsent,
  setAiConsentUser,
  type AiConsentSheetMode,
} from '../ai-consent';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  __resetAiConsentForTests();
  (AsyncStorage as unknown as { __reset: () => void }).__reset();
});

describe('ensureAiConsent', () => {
  it("n'envoie rien sans feuille montée", async () => {
    expect(await ensureAiConsent()).toBe(false);
  });

  it('demande une seule fois, puis se souvient du oui', async () => {
    const modes: AiConsentSheetMode[] = [];
    registerAiConsentPresenter(async (mode) => { modes.push(mode); return 'granted'; });
    setAiConsentUser('u1');
    expect(await ensureAiConsent()).toBe(true);
    expect(await ensureAiConsent()).toBe(true);
    expect(modes).toEqual(['ask']);
    expect(await AsyncStorage.getItem('yumia.aiConsent.v1.u1')).toBe('granted');
  });

  it('refus : la fonction ne tourne pas, et la feuille suivante propose de réactiver', async () => {
    const modes: AiConsentSheetMode[] = [];
    let answer: 'granted' | 'denied' | null = 'denied';
    registerAiConsentPresenter(async (mode) => { modes.push(mode); return answer; });
    setAiConsentUser('u1');
    expect(await ensureAiConsent()).toBe(false);
    answer = null; // fermée sans choisir
    expect(await ensureAiConsent()).toBe(false);
    expect(await getAiConsent()).toBe('denied');
    answer = 'granted';
    expect(await ensureAiConsent()).toBe(true);
    expect(modes).toEqual(['ask', 'refused', 'refused']);
  });

  it('fermer sans choisir ne mémorise rien', async () => {
    registerAiConsentPresenter(async () => null);
    setAiConsentUser('u1');
    expect(await ensureAiConsent()).toBe(false);
    expect(await getAiConsent()).toBeNull();
  });

  it('appels simultanés : une seule feuille', async () => {
    let calls = 0;
    registerAiConsentPresenter(async () => { calls++; await flush(); return 'granted'; });
    setAiConsentUser('u1');
    const [a, b] = await Promise.all([ensureAiConsent(), ensureAiConsent()]);
    expect([a, b]).toEqual([true, true]);
    expect(calls).toBe(1);
  });

  it('le choix est propre à chaque compte', async () => {
    registerAiConsentPresenter(async () => 'granted');
    setAiConsentUser('u1');
    await setAiConsent('denied');
    setAiConsentUser('u2');
    expect(await getAiConsent()).toBeNull();
  });
});

describe('aiConsentHeaders', () => {
  it("n'envoie l'en-tête qu'une fois le choix connu", async () => {
    setAiConsentUser('u1');
    await flush();
    expect(aiConsentHeaders()).toEqual({});
    await setAiConsent('denied');
    expect(aiConsentHeaders()).toEqual({ 'X-AI-Consent': 'denied' });
  });
});
