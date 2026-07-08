import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MenuAiHandler } from './handlers/menu-ai.handler';
import { EventsHandler } from './handlers/events.handler';
import type { AddMenuItemsDto, ExtractMenuPhotoDto, FetchEventsDto } from './pipeline.controller';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menuAi: MenuAiHandler,
    private readonly events: EventsHandler,
  ) {}

  // ── MENU ──────────────────────────────────────────────────────────────────

  async getMenu(placeId: string, language = 'fr') {
    const menu = await this.prisma.placeMenu.findUnique({
      where: { placeId_language: { placeId, language } },
      include: { items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
    });
    if (!menu) return { placeId, language, items: [] };
    return menu;
  }

  async addMenuItems(placeId: string, dto: AddMenuItemsDto) {
    await this.ensurePlaceExists(placeId);
    const menu = await this.upsertMenu(placeId, dto.language ?? 'fr', 'manual');
    const created = await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.menuItem.create({ data: { menuId: menu.id, ...item } }),
      ),
    );
    this.logger.log(`[menu] +${created.length} items ajoutés → place ${placeId}`);
    return { added: created.length, menuId: menu.id };
  }

  async extractMenuFromPhoto(placeId: string, dto: ExtractMenuPhotoDto) {
    await this.ensurePlaceExists(placeId);
    const job = await this.prisma.enrichmentJob.create({
      data: { placeId, type: 'menu_photo', status: 'pending', input: { photoUrl: dto.photoUrl, language: dto.language ?? 'fr' } },
    });

    // Traitement async : on le lance en tâche de fond sans await
    this.runMenuExtraction(job.id, placeId, dto).catch((err: unknown) => {
      this.logger.error(`[menu_photo] job ${job.id} failed: ${String(err)}`);
    });

    return { jobId: job.id, status: 'pending' };
  }

  private async runMenuExtraction(jobId: string, placeId: string, dto: ExtractMenuPhotoDto) {
    await this.prisma.enrichmentJob.update({ where: { id: jobId }, data: { status: 'running' } });
    try {
      const items = await this.menuAi.extractFromPhoto(dto.photoUrl, dto.language ?? 'fr');
      if (items.length > 0) {
        const menu = await this.upsertMenu(placeId, dto.language ?? 'fr', 'ai_extract');
        await this.prisma.$transaction(
          items.map((item) => this.prisma.menuItem.create({ data: { menuId: menu.id, ...item } })),
        );
      }
      await this.prisma.enrichmentJob.update({
        where: { id: jobId },
        data: { status: 'done', output: { itemsExtracted: items.length } },
      });
      this.logger.log(`[menu_photo] job ${jobId} → ${items.length} items extraits`);
    } catch (err) {
      await this.prisma.enrichmentJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: String(err) },
      });
      throw err;
    }
  }

  // ── ÉVÉNEMENTS ────────────────────────────────────────────────────────────

  async getEvents(placeId: string, fromDate?: Date) {
    const from = fromDate ?? new Date();
    return this.prisma.placeEvent.findMany({
      where: { placeId, startAt: { gte: from } },
      orderBy: { startAt: 'asc' },
      take: 50,
    });
  }

  async fetchEvents(placeId: string, dto: FetchEventsDto) {
    await this.ensurePlaceExists(placeId);
    const job = await this.prisma.enrichmentJob.create({
      data: { placeId, type: 'events_fetch', status: 'pending', input: dto as Record<string, unknown> },
    });

    this.runEventsFetch(job.id, placeId, dto).catch((err: unknown) => {
      this.logger.error(`[events_fetch] job ${job.id} failed: ${String(err)}`);
    });

    return { jobId: job.id, status: 'pending' };
  }

  private async runEventsFetch(jobId: string, placeId: string, dto: FetchEventsDto) {
    await this.prisma.enrichmentJob.update({ where: { id: jobId }, data: { status: 'running' } });
    try {
      const events = await this.events.fetchForPlace(dto);
      let upserted = 0;
      for (const ev of events) {
        await this.prisma.placeEvent.upsert({
          where: { placeId_source_externalId: { placeId, source: ev.source, externalId: ev.externalId ?? '' } },
          update: { title: ev.title, description: ev.description, startAt: ev.startAt, endAt: ev.endAt, price: ev.price, ticketUrl: ev.ticketUrl, photoUrl: ev.photoUrl },
          create: { placeId, ...ev },
        });
        upserted++;
      }
      await this.prisma.enrichmentJob.update({
        where: { id: jobId },
        data: { status: 'done', output: { eventsUpserted: upserted } },
      });
      this.logger.log(`[events_fetch] job ${jobId} → ${upserted} événements`);
    } catch (err) {
      await this.prisma.enrichmentJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: String(err) },
      });
      throw err;
    }
  }

  // ── JOBS ──────────────────────────────────────────────────────────────────

  async listJobs(placeId?: string, status?: string, limit = 50) {
    return this.prisma.enrichmentJob.findMany({
      where: {
        ...(placeId ? { placeId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  private async ensurePlaceExists(placeId: string) {
    const place = await this.prisma.place.findUnique({ where: { id: placeId }, select: { id: true } });
    if (!place) throw new NotFoundException(`Place ${placeId} introuvable`);
  }

  private async upsertMenu(placeId: string, language: string, source: string) {
    return this.prisma.placeMenu.upsert({
      where: { placeId_language: { placeId, language } },
      update: { source },
      create: { placeId, language, source },
    });
  }
}
