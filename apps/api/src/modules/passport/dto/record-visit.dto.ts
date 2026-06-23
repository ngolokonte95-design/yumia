import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { VisitFeedback } from '@prisma/client';

const FEEDBACKS = ['loved', 'neutral', 'disliked'] as const;

/** Enregistrement d'une visite (« J'y suis allé »). */
export class RecordVisitDto {
  @IsUUID()
  placeId!: string;

  @IsOptional()
  @IsIn(FEEDBACKS as unknown as string[])
  feedback?: VisitFeedback;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
