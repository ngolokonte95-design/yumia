import { IsInt, IsNumber, IsString, Max, Min } from 'class-validator';

/** Corps de POST /tickets/purchase. */
export class PurchaseTicketDto {
  @IsString()
  venueId!: string;

  @IsString()
  eventId!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  /** Prix unitaire du billet (en euros). */
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}
