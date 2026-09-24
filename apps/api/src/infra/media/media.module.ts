import { Module } from '@nestjs/common';
import { ImageSanitizeService } from './image-sanitize.service';

/**
 * Traitements des médias envoyés par les utilisateurs. `ImageSanitizeService`
 * retire les métadonnées (dont la position GPS) de toute photo avant stockage.
 */
@Module({
  providers: [ImageSanitizeService],
  exports: [ImageSanitizeService],
})
export class MediaModule {}
