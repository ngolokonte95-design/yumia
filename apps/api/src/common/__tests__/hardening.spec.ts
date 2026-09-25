import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Request } from 'express';
import { clampLimit } from '../pagination';
import { serializeReqWithoutQuery, stripQuery } from '../strip-query';
import { QuotaService } from '../quota/quota.service';
import { snapPhotoWidth } from '../../modules/places/places.controller';
import { webhookSecretMatches } from '../../modules/affiliates/affiliates.controller';
import { boundRawPayload } from '../../modules/affiliates/affiliates.service';
import { ChatbotMessageDto } from '../../modules/chatbot/dto/chatbot-message.dto';
import { TranslateDto } from '../../modules/chat/dto/translate.dto';
import { GenerateItineraryDto } from '../../modules/itinerary/dto/generate-itinerary.dto';
import { CreateReviewDto } from '../../modules/reviews/dto/create-review.dto';

const errors = <T extends object>(cls: new () => T, plain: object) =>
  validateSync(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true });

describe('clampLimit', () => {
  it('borne, et retombe sur la valeur par défaut si invalide', () => {
    expect(clampLimit(undefined, 30)).toBe(30);
    expect(clampLimit('abc', 30)).toBe(30);
    expect(clampLimit('-5', 30)).toBe(30);
    expect(clampLimit('1000000', 30)).toBe(100);
    expect(clampLimit('70', 30, 50)).toBe(50);
    expect(clampLimit('12', 30)).toBe(12);
  });
});

describe('stripQuery', () => {
  it('ne garde que le chemin', () => {
    expect(stripQuery('/api/places/nearby?lat=48.85&lng=2.35')).toBe('/api/places/nearby');
    expect(stripQuery('/api/health')).toBe('/api/health');
    const out = serializeReqWithoutQuery({ method: 'GET', url: '/a?lat=1', query: { lat: '1' } });
    expect(out).toEqual({ method: 'GET', url: '/a' });
  });
});

describe('snapPhotoWidth', () => {
  it('ramène la largeur au palier le plus proche', () => {
    expect(snapPhotoWidth(undefined)).toBe(800);
    expect(snapPhotoWidth('abc')).toBe(800);
    expect(snapPhotoWidth('800')).toBe(800);
    expect(snapPhotoWidth('1')).toBe(200);
    expect(snapPhotoWidth('799')).toBe(800);
    expect(snapPhotoWidth('4800')).toBe(1200);
    expect(snapPhotoWidth('600')).toBe(800);
  });
});

describe('webhookSecretMatches', () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; });

  it('compare au secret configuré', () => {
    process.env.AFFILIATE_WEBHOOK_SECRET = 's3cret';
    expect(webhookSecretMatches('s3cret')).toBe(true);
    expect(webhookSecretMatches('nope')).toBe(false);
    expect(webhookSecretMatches(undefined)).toBe(false);
  });

  it('refuse tout en production quand le secret est absent', () => {
    delete process.env.AFFILIATE_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';
    expect(webhookSecretMatches('anything')).toBe(false);
  });
});

describe('boundRawPayload', () => {
  it('garde un petit corps, tronque un gros', () => {
    expect(boundRawPayload({ a: 1 })).toEqual({ a: 1 });
    const big = boundRawPayload({ s: 'x'.repeat(50_000) }) as { truncated: boolean; excerpt: string };
    expect(big.truncated).toBe(true);
    expect(big.excerpt.length).toBe(10_000);
  });
});

describe('DTOs', () => {
  it('chatbot : accepte le corps envoyé par l’app, refuse un historique démesuré', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'ok' }));
    expect(errors(ChatbotMessageDto, { message: 'salut', history, city: 'Paris' })).toHaveLength(0);
    expect(errors(ChatbotMessageDto, { message: 'x', history: Array(21).fill({ role: 'user', content: 'a' }) }).length).toBeGreaterThan(0);
    expect(errors(ChatbotMessageDto, { message: 'x', history: [{ role: 'system', content: 'a' }] }).length).toBeGreaterThan(0);
    expect(errors(ChatbotMessageDto, { message: 'x'.repeat(2001) }).length).toBeGreaterThan(0);
  });

  it('traduction : langues de l’app uniquement', () => {
    expect(errors(TranslateDto, { text: 'hello', targetLocale: 'fr' })).toHaveLength(0);
    expect(errors(TranslateDto, { text: 'hello', targetLocale: 'klingon' }).length).toBeGreaterThan(0);
  });

  it('itinéraire : mode dans la liste fermée', () => {
    const base = { duration: 'soirée', budget: 'moyen', city: 'Paris' };
    expect(errors(GenerateItineraryDto, { ...base, mood: 'date' })).toHaveLength(0);
    expect(errors(GenerateItineraryDto, { ...base, mood: 'date2' }).length).toBeGreaterThan(0);
  });

  it('avis : note entière 1..5', () => {
    expect(errors(CreateReviewDto, { rating: 4, body: 'Top' })).toHaveLength(0);
    expect(errors(CreateReviewDto, { rating: 6 }).length).toBeGreaterThan(0);
    expect(errors(CreateReviewDto, { rating: 2.5 }).length).toBeGreaterThan(0);
  });
});

describe('QuotaService — perDayByPlan', () => {
  it('applique le plafond propre à la route selon le forfait', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const stored: Record<string, number> = { [`quota:translate:u:u1:${day}`]: 200 };
    const redis = { raw: { get: jest.fn(async (k: string) => (k in stored ? String(stored[k]) : null)) } } as never;
    const mk = (plan: string) =>
      new QuotaService(redis, { user: { findUnique: jest.fn(async () => ({ plan })) } } as never);
    const req = { user: { sub: 'u1' }, body: {} } as unknown as Request;
    const rule = { name: 'translate', perDayByPlan: { free: 200, gold: 1000 } };
    await expect(mk('free').assertAvailable(rule, req)).rejects.toMatchObject({ status: 429 });
    await expect(mk('gold').assertAvailable(rule, req)).resolves.toBeTruthy();
  });
});
