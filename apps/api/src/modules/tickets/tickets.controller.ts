import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Ticket } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { TicketsService } from './tickets.service';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';

/** Billetterie clubs / soirées. */
@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  /** POST /api/tickets/purchase — achat de billet(s) (commission 15%). 20/60s. */
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('purchase')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  purchase(@CurrentUser() user: JwtPayload, @Body() dto: PurchaseTicketDto): Promise<Ticket> {
    return this.tickets.purchase(user.sub, dto);
  }
}
