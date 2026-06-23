import { IsIn, IsString, IsUUID } from 'class-validator';

export class VoteDto {
  @IsUUID()
  placeId!: string;

  @IsString()
  @IsIn(['like', 'dislike'])
  vote!: 'like' | 'dislike';
}
