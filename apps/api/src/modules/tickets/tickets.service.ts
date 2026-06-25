import { Injectable, NotFoundException } from '@nestjs/common';
import type { Ticket } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { PurchaseTicketDto } from './dto/purchase-ticket.dto';

/** Commission YUMIA prélevée sur chaque billet vendu. */
export const TICKET_COMMISSION_RATE = 0.15;

/**
 * Billetterie clubs / soirées. La commission (15%) est calculée et persistée à
 * l'achat. ⚠️ L'encaissement réel (Stripe Connect : débit client + reversement
 * net au partenaire) reste à brancher — le billet est créé en statut `pending`.
 */
@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async purchase(userId: string | null, dto: PurchaseTicketDto): Promise<Ticket> {
    const venue = await this.prisma.venue.findUnique({ where: { id: dto.venueId } });
    if (!venue) {
      throw new NotFoundException('Établissement introuvable.');
    }

    const totalPrice = round2(dto.unitPrice * dto.quantity);
    const rate = venue.commissionRate ?? TICKET_COMMISSION_RATE;
    const commission = round2(totalPrice * rate);

    // TODO Stripe : encaisser `totalPrice`, reverser `totalPrice - commission`
    // au partenaire, puis passer le statut à `paid` via webhook.
    return this.prisma.ticket.create({
      data: {
        venueId: dto.venueId,
        eventId: dto.eventId,
        userId,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        totalPrice,
        commission,
        status: 'pending',
      },
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
