import { IsIn } from 'class-validator';

/** Corps de POST /auth/premium/activate. */
export class ActivatePremiumDto {
  /** Formule choisie. */
  @IsIn(['monthly', 'annual'])
  plan!: 'monthly' | 'annual';
}
