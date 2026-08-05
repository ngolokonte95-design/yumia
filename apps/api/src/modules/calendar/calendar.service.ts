import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { expandOccurrences, parseRRule } from './recurrence';

/**
 * Calendrier personnel Yumia.
 *
 * Deux principes tiennent tout le module :
 *
 * 1. **Les instants sont absolus.** `startAt` est en UTC ; `timezone` conserve
 *    séparément le fuseau du lieu. Un dîner à Tokyo reste à 20h heure de Tokyo,
 *    qu'on le consulte depuis Paris ou depuis Tokyo.
 * 2. **La récurrence est développée à la lecture**, jamais stockée. Une série
 *    « tous les ans » n'occupe qu'une ligne en base ; les occurrences sont
 *    calculées pour la fenêtre demandée.
 */

export const CATEGORIES = [
  'restaurant', 'activity', 'travel', 'hotel', 'event', 'personal', 'birthday',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface EventInput {
  title: string;
  notes?: string | null;
  category?: string;
  startAt: string;
  endAt?: string | null;
  timezone?: string;
  allDay?: boolean;
  rrule?: string | null;
  reminderMinutes?: number | null;
  placeId?: string | null;
  placeName?: string | null;
  address?: string | null;
}

/** Une occurrence concrète, prête à afficher. */
export interface EventOccurrence {
  /** Identifiant de l'événement source (partagé par toute la série). */
  id: string;
  /** Identifiant unique de CETTE occurrence — indispensable comme clé de liste. */
  occurrenceId: string;
  title: string;
  notes: string | null;
  category: string;
  startAt: string;
  endAt: string | null;
  timezone: string;
  allDay: boolean;
  /** Vrai si l'occurrence provient d'une série récurrente. */
  recurring: boolean;
  rrule: string | null;
  reminderMinutes: number | null;
  placeId: string | null;
  placeName: string | null;
  address: string | null;
}

/** Un mois de vue, plus large marge : borne la fenêtre interrogeable. */
const MAX_RANGE_DAYS = 400;

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Occurrences chevauchant `[from, to]`, séries développées.
   *
   * Les événements récurrents sont chargés quelle que soit leur date de départ
   * (une série démarrée en 1995 produit encore des occurrences aujourd'hui),
   * tandis que les ponctuels sont filtrés en SQL.
   */
  async list(
    userId: string, from: Date, to: Date, category?: string,
  ): Promise<EventOccurrence[]> {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Dates de période invalides.');
    }
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('La fin de période précède son début.');
    }
    const span = (to.getTime() - from.getTime()) / 86_400_000;
    if (span > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Période trop large (max ${MAX_RANGE_DAYS} jours).`);
    }

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        ...(category ? { category } : {}),
        OR: [
          // Ponctuels : filtrés directement sur la fenêtre.
          { rrule: null, startAt: { lte: to } },
          // Récurrents : impossible de filtrer en SQL sans développer la règle.
          { rrule: { not: null } },
        ],
      },
      orderBy: { startAt: 'asc' },
    });

    const occurrences: EventOccurrence[] = [];

    for (const e of events) {
      const durationMs = e.endAt
        ? Math.max(e.endAt.getTime() - e.startAt.getTime(), 0)
        : 0;

      const dates = expandOccurrences(
        e.startAt,
        durationMs,
        parseRRule(e.rrule),
        from,
        to,
        e.excludedDates,
      );

      for (const start of dates) {
        occurrences.push({
          id: e.id,
          // Une série partage un même `id` : sans suffixe d'instant, deux
          // occurrences auraient la même clé de liste côté mobile.
          occurrenceId: `${e.id}:${start.toISOString()}`,
          title: e.title,
          notes: e.notes,
          category: e.category,
          startAt: start.toISOString(),
          endAt: durationMs > 0 ? new Date(start.getTime() + durationMs).toISOString() : null,
          timezone: e.timezone,
          allDay: e.allDay,
          recurring: !!e.rrule,
          rrule: e.rrule,
          reminderMinutes: e.reminderMinutes,
          placeId: e.placeId,
          placeName: e.placeName,
          address: e.address,
        });
      }
    }

    return occurrences.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  async create(userId: string, input: EventInput): Promise<EventOccurrence> {
    const data = this.validate(input);
    const created = await this.prisma.calendarEvent.create({
      data: { ...data, userId },
    });
    return this.toOccurrence(created);
  }

  async update(userId: string, id: string, input: Partial<EventInput>): Promise<EventOccurrence> {
    await this.assertOwnership(userId, id);

    // Validation partielle : on ne revalide que ce qui est fourni.
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException('Titre requis.');
      patch.title = title;
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.category !== undefined) patch.category = this.normalizeCategory(input.category);
    if (input.startAt !== undefined) patch.startAt = this.parseDate(input.startAt, 'startAt');
    if (input.endAt !== undefined) {
      patch.endAt = input.endAt ? this.parseDate(input.endAt, 'endAt') : null;
    }
    if (input.timezone !== undefined) patch.timezone = input.timezone || 'UTC';
    if (input.allDay !== undefined) patch.allDay = input.allDay;
    if (input.rrule !== undefined) patch.rrule = this.normalizeRrule(input.rrule);
    if (input.reminderMinutes !== undefined) patch.reminderMinutes = input.reminderMinutes;
    if (input.placeId !== undefined) patch.placeId = input.placeId;
    if (input.placeName !== undefined) patch.placeName = input.placeName;
    if (input.address !== undefined) patch.address = input.address;

    const updated = await this.prisma.calendarEvent.update({ where: { id }, data: patch });
    return this.toOccurrence(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwnership(userId, id);
    await this.prisma.calendarEvent.delete({ where: { id } });
  }

  /**
   * Supprime une seule occurrence d'une série, sans casser le reste.
   * C'est l'attente naturelle quand on annule un rendez-vous récurrent une
   * fois : supprimer toute la série serait destructeur.
   */
  async removeOccurrence(userId: string, id: string, occurrenceIso: string): Promise<void> {
    await this.assertOwnership(userId, id);
    const date = this.parseDate(occurrenceIso, 'occurrence');

    await this.prisma.calendarEvent.update({
      where: { id },
      data: { excludedDates: { push: date } },
    });
  }

  /** Recherche plein texte sur le titre, les notes et le lieu. */
  async search(userId: string, query: string, limit = 30): Promise<EventOccurrence[]> {
    const q = query?.trim();
    if (!q) return [];

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { notes: { contains: q, mode: 'insensitive' } },
          { placeName: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { startAt: 'desc' },
      take: limit,
    });

    return events.map((e) => this.toOccurrence(e));
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  private validate(input: EventInput) {
    const title = input.title?.trim();
    if (!title) throw new BadRequestException('Titre requis.');

    const startAt = this.parseDate(input.startAt, 'startAt');
    const endAt = input.endAt ? this.parseDate(input.endAt, 'endAt') : null;
    if (endAt && endAt.getTime() < startAt.getTime()) {
      throw new BadRequestException('La fin précède le début.');
    }

    return {
      title,
      notes: input.notes ?? null,
      category: this.normalizeCategory(input.category),
      startAt,
      endAt,
      timezone: input.timezone || 'UTC',
      allDay: input.allDay ?? false,
      rrule: this.normalizeRrule(input.rrule),
      reminderMinutes: input.reminderMinutes ?? null,
      placeId: input.placeId ?? null,
      placeName: input.placeName ?? null,
      address: input.address ?? null,
    };
  }

  private parseDate(raw: string, field: string): Date {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`Date invalide : ${field}.`);
    return d;
  }

  private normalizeCategory(raw?: string): Category {
    const value = (raw ?? 'personal') as Category;
    return CATEGORIES.includes(value) ? value : 'personal';
  }

  /**
   * Rejette une règle non analysable plutôt que de la stocker : une RRULE
   * invalide en base produirait silencieusement un événement ponctuel, et
   * l'utilisateur croirait sa série créée.
   */
  private normalizeRrule(raw?: string | null): string | null {
    if (!raw?.trim()) return null;
    if (!parseRRule(raw)) throw new BadRequestException('Règle de récurrence invalide.');
    return raw.trim();
  }

  private async assertOwnership(userId: string, id: string): Promise<void> {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable.');
    if (event.userId !== userId) throw new ForbiddenException('Événement d\'un autre utilisateur.');
  }

  private toOccurrence(e: {
    id: string; title: string; notes: string | null; category: string;
    startAt: Date; endAt: Date | null; timezone: string; allDay: boolean;
    rrule: string | null; reminderMinutes: number | null;
    placeId: string | null; placeName: string | null; address: string | null;
  }): EventOccurrence {
    return {
      id: e.id,
      occurrenceId: `${e.id}:${e.startAt.toISOString()}`,
      title: e.title,
      notes: e.notes,
      category: e.category,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt?.toISOString() ?? null,
      timezone: e.timezone,
      allDay: e.allDay,
      recurring: !!e.rrule,
      rrule: e.rrule,
      reminderMinutes: e.reminderMinutes,
      placeId: e.placeId,
      placeName: e.placeName,
      address: e.address,
    };
  }
}
