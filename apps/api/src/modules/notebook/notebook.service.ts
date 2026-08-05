import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Bloc-notes Yumia.
 *
 * **Synchronisation multi-appareils :** dernier écrivain gagne, arbitré par
 * `updatedAt`. Le client peut transmettre l'`updatedAt` qu'il connaît : si le
 * serveur en a un plus récent, on le signale plutôt que d'écraser en silence.
 * Un merge par champ (CRDT) serait disproportionné pour des notes personnelles.
 */

export type NoteKind = 'note' | 'checklist';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface NoteInput {
  title?: string | null;
  content?: string;
  kind?: NoteKind;
  items?: ChecklistItem[];
  color?: string | null;
  pinned?: boolean;
  archived?: boolean;
  favorite?: boolean;
  photoUrls?: string[];
  links?: string[];
  placeId?: string | null;
  placeName?: string | null;
  lat?: number | null;
  lng?: number | null;
  noteDate?: string | null;
  calendarEventId?: string | null;
  /**
   * `updatedAt` connu du client. Fourni, il permet de détecter qu'on écrase
   * une version plus récente écrite depuis un autre appareil.
   */
  knownUpdatedAt?: string;
}

export interface ListFilters {
  archived?: boolean;
  favorite?: boolean;
  query?: string;
  placeId?: string;
  calendarEventId?: string;
  /** Notes rattachées à une journée précise (AAAA-MM-JJ). */
  date?: string;
}

/** Au-delà, l'écran pagine ; sans borne, un gros bloc-notes saturerait la réponse. */
const MAX_LIMIT = 200;

@Injectable()
export class NotebookService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, filters: ListFilters = {}, limit = 100) {
    const { archived = false, favorite, query, placeId, calendarEventId, date } = filters;

    let dateRange: { gte: Date; lte: Date } | undefined;
    if (date) {
      const day = new Date(`${date}T00:00:00.000Z`);
      if (Number.isNaN(day.getTime())) throw new BadRequestException('Date invalide.');
      dateRange = { gte: day, lte: new Date(day.getTime() + 86_399_999) };
    }

    return this.prisma.notebookNote.findMany({
      where: {
        userId,
        archived,
        ...(favorite !== undefined ? { favorite } : {}),
        ...(placeId ? { placeId } : {}),
        ...(calendarEventId ? { calendarEventId } : {}),
        ...(dateRange ? { noteDate: dateRange } : {}),
        ...(query?.trim()
          ? {
            OR: [
              { title: { contains: query.trim(), mode: 'insensitive' as const } },
              { content: { contains: query.trim(), mode: 'insensitive' as const } },
              { placeName: { contains: query.trim(), mode: 'insensitive' as const } },
            ],
          }
          : {}),
      },
      // Les notes épinglées d'abord, puis les plus récemment modifiées.
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: Math.min(limit, MAX_LIMIT),
    });
  }

  async get(userId: string, id: string) {
    const note = await this.prisma.notebookNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Note introuvable.');
    if (note.userId !== userId) throw new ForbiddenException('Note d\'un autre utilisateur.');
    return note;
  }

  async create(userId: string, input: NoteInput) {
    const data = this.normalize(input);
    // Une note entièrement vide n'a aucun intérêt et encombre la liste.
    if (!data.title && !data.content && (data.items as ChecklistItem[]).length === 0) {
      throw new BadRequestException('Une note ne peut pas être entièrement vide.');
    }
    return this.prisma.notebookNote.create({ data: { ...data, userId } });
  }

  /**
   * Met à jour une note.
   *
   * @returns la note à jour, plus `staleWrite` si le client travaillait sur une
   * version antérieure à celle du serveur (écriture concurrente détectée).
   */
  async update(userId: string, id: string, input: NoteInput) {
    const existing = await this.get(userId, id);

    const staleWrite = !!input.knownUpdatedAt
      && new Date(input.knownUpdatedAt).getTime() < existing.updatedAt.getTime();

    const patch = this.normalize(input, { partial: true });
    const updated = await this.prisma.notebookNote.update({ where: { id }, data: patch });

    return { ...updated, staleWrite };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.prisma.notebookNote.delete({ where: { id } });
  }

  /** Archive plutôt que supprimer — récupérable, comme dans toute app de notes. */
  async setArchived(userId: string, id: string, archived: boolean) {
    await this.get(userId, id);
    return this.prisma.notebookNote.update({ where: { id }, data: { archived } });
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  private normalize(input: NoteInput, opts: { partial?: boolean } = {}) {
    const out: Record<string, unknown> = {};
    const set = (key: string, value: unknown, always = false) => {
      if (always || value !== undefined) out[key] = value;
    };

    if (!opts.partial) {
      out.title = input.title?.trim() || null;
      out.content = input.content?.trim() ?? '';
      out.kind = input.kind === 'checklist' ? 'checklist' : 'note';
      out.items = this.normalizeItems(input.items);
      out.photoUrls = input.photoUrls ?? [];
      out.links = input.links ?? [];
      out.pinned = input.pinned ?? false;
      out.archived = input.archived ?? false;
      out.favorite = input.favorite ?? false;
    } else {
      if (input.title !== undefined) out.title = input.title?.trim() || null;
      if (input.content !== undefined) out.content = input.content.trim();
      if (input.kind !== undefined) out.kind = input.kind === 'checklist' ? 'checklist' : 'note';
      if (input.items !== undefined) out.items = this.normalizeItems(input.items);
      set('photoUrls', input.photoUrls);
      set('links', input.links);
      set('pinned', input.pinned);
      set('archived', input.archived);
      set('favorite', input.favorite);
    }

    set('color', input.color);
    set('placeId', input.placeId);
    set('placeName', input.placeName);
    set('lat', input.lat);
    set('lng', input.lng);
    set('calendarEventId', input.calendarEventId);

    if (input.noteDate !== undefined) {
      if (input.noteDate === null) out.noteDate = null;
      else {
        const d = new Date(input.noteDate);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('Date de note invalide.');
        out.noteDate = d;
      }
    }

    return out;
  }

  /**
   * Nettoie les éléments de checklist : identifiants garantis, textes vides
   * écartés. Sans ça, une coche sans libellé s'accumulerait à chaque frappe.
   */
  private normalizeItems(items?: ChecklistItem[]): ChecklistItem[] {
    if (!Array.isArray(items)) return [];
    return items
      .filter((i) => typeof i?.text === 'string' && i.text.trim().length > 0)
      .map((i, index) => ({
        id: i.id || `item-${index}-${Date.now()}`,
        text: i.text.trim(),
        done: !!i.done,
      }));
  }
}
