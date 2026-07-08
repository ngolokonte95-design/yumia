import { Injectable, Logger } from '@nestjs/common';
import type { FetchEventsDto } from '../pipeline.controller';

export interface FetchedEvent {
  title: string;
  description?: string;
  startAt: Date;
  endAt?: Date;
  price?: number;
  currency: string;
  ticketUrl?: string;
  photoUrl?: string;
  source: string;
  externalId?: string;
}

@Injectable()
export class EventsHandler {
  private readonly logger = new Logger(EventsHandler.name);

  async fetchForPlace(dto: FetchEventsDto): Promise<FetchedEvent[]> {
    const results: FetchedEvent[] = [];

    if (dto.source === 'ticketmaster' || dto.source === 'all') {
      const tm = await this.fetchTicketmaster(dto);
      results.push(...tm);
    }

    if (dto.source === 'eventbrite' || dto.source === 'all') {
      const eb = await this.fetchEventbrite(dto);
      results.push(...eb);
    }

    return results;
  }

  // ── Ticketmaster Discovery API ──────────────────────────────────────────

  private async fetchTicketmaster(dto: FetchEventsDto): Promise<FetchedEvent[]> {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      this.logger.warn('[events] TICKETMASTER_API_KEY non configurée');
      return [];
    }

    try {
      const params = new URLSearchParams({
        apikey: apiKey,
        latlong: `${dto.lat},${dto.lng}`,
        radius: String(dto.radiusKm ?? 5),
        unit: 'km',
        size: '20',
        sort: 'date,asc',
        ...(dto.keyword ? { keyword: dto.keyword } : {}),
        ...(dto.startDate ? { startDateTime: new Date(dto.startDate).toISOString() } : {}),
      });

      const res = await fetch(
        `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as TicketmasterResponse;

      const events = data?._embedded?.events ?? [];
      return events.map((ev): FetchedEvent => ({
        title: ev.name,
        description: ev.info ?? ev.pleaseNote,
        startAt: new Date(ev.dates.start.dateTime ?? ev.dates.start.localDate),
        endAt: ev.dates.end?.dateTime ? new Date(ev.dates.end.dateTime) : undefined,
        price: ev.priceRanges?.[0]?.min,
        currency: ev.priceRanges?.[0]?.currency ?? 'EUR',
        ticketUrl: ev.url,
        photoUrl: ev.images?.[0]?.url,
        source: 'ticketmaster',
        externalId: ev.id,
      }));
    } catch (err) {
      this.logger.error(`[events] Ticketmaster error: ${String(err)}`);
      return [];
    }
  }

  // ── Eventbrite API ───────────────────────────────────────────────────────

  private async fetchEventbrite(dto: FetchEventsDto): Promise<FetchedEvent[]> {
    const token = process.env.EVENTBRITE_TOKEN;
    if (!token) {
      this.logger.warn('[events] EVENTBRITE_TOKEN non configuré');
      return [];
    }

    try {
      const params = new URLSearchParams({
        'location.latitude': String(dto.lat),
        'location.longitude': String(dto.lng),
        'location.within': `${dto.radiusKm ?? 5}km`,
        expand: 'ticket_classes,venue',
        ...(dto.keyword ? { q: dto.keyword } : {}),
        ...(dto.startDate ? { 'start_date.range_start': new Date(dto.startDate).toISOString() } : {}),
      });

      const res = await fetch(
        `https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as EventbriteResponse;

      return (data?.events ?? []).map((ev): FetchedEvent => ({
        title: ev.name.text,
        description: ev.description?.text?.slice(0, 500),
        startAt: new Date(ev.start.utc),
        endAt: new Date(ev.end.utc),
        price: ev.ticket_classes?.[0]?.cost?.major_value
          ? parseFloat(ev.ticket_classes[0].cost.major_value)
          : undefined,
        currency: ev.currency ?? 'EUR',
        ticketUrl: ev.url,
        photoUrl: ev.logo?.url,
        source: 'eventbrite',
        externalId: ev.id,
      }));
    } catch (err) {
      this.logger.error(`[events] Eventbrite error: ${String(err)}`);
      return [];
    }
  }
}

// ── Types de réponse API ────────────────────────────────────────────────────

interface TicketmasterResponse {
  _embedded?: {
    events?: Array<{
      id: string;
      name: string;
      url: string;
      info?: string;
      pleaseNote?: string;
      dates: { start: { localDate: string; dateTime?: string }; end?: { dateTime?: string } };
      priceRanges?: Array<{ min: number; currency: string }>;
      images?: Array<{ url: string }>;
    }>;
  };
}

interface EventbriteResponse {
  events?: Array<{
    id: string;
    name: { text: string };
    description?: { text: string };
    start: { utc: string };
    end: { utc: string };
    url: string;
    currency: string;
    logo?: { url: string };
    ticket_classes?: Array<{ cost?: { major_value: string } }>;
  }>;
}
