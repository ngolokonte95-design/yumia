import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const FFMPEG_TIMEOUT_MS = 20_000;

/** Formats réécrits tels quels (même format en sortie) ; tout le reste part en JPEG. */
const KEPT_FORMATS = {
  jpeg: { ext: '.jpg', mime: 'image/jpeg' },
  png: { ext: '.png', mime: 'image/png' },
  webp: { ext: '.webp', mime: 'image/webp' },
} as const;

export interface SanitizedImage {
  /** Image réencodée, sans aucune métadonnée (EXIF, GPS, XMP, IPTC). */
  buffer: Buffer;
  /** Extension correspondant au format RÉEL de `buffer` (peut différer de l'original : HEIC → .jpg). */
  ext: '.jpg' | '.png' | '.webp';
  mime: string;
}

/**
 * Arguments ffmpeg du repli (HEIC & formats que sharp ne sait pas décoder) :
 * une seule image, en JPEG, sans aucune métadonnée recopiée depuis la source.
 */
export function imageFallbackArgs(input: string, output: string): string[] {
  return [
    '-y', '-i', input,
    '-map_metadata', '-1',
    '-frames:v', '1',
    '-q:v', '2',
    output,
  ];
}

/**
 * Nettoyage des photos uploadées par les utilisateurs.
 *
 * Une photo prise chez soi embarque, dans son bloc EXIF, les coordonnées GPS
 * exactes du domicile — la publier telle quelle revient à publier l'adresse.
 * Toute image d'utilisateur passe donc ici avant `StorageService.save` :
 *
 * 1. **sharp** (jpeg/png/webp/avif/gif/tiff) : `rotate()` applique l'orientation
 *    EXIF aux pixels, puis l'image est réencodée sans `withMetadata()` → EXIF,
 *    GPS, XMP et IPTC disparaissent (seul le profil ICC est conservé, pour les
 *    couleurs Display P3 des iPhone ; il ne contient aucune position).
 * 2. **ffmpeg** en repli (HEIC, que les binaires précompilés de sharp ne
 *    décodent pas) : conversion en JPEG avec `-map_metadata -1`, puis nouveau
 *    passage par sharp pour normaliser.
 * 3. Si les deux échouent : **400 « Image illisible »**. On ne stocke jamais
 *    l'original faute de mieux — ce serait publier la position.
 */
@Injectable()
export class ImageSanitizeService {
  private readonly logger = new Logger(ImageSanitizeService.name);

  async sanitize(input: Buffer): Promise<SanitizedImage> {
    try {
      return await this.withSharp(input);
    } catch (err) {
      this.logger.warn(`sharp n'a pas pu traiter l'image (${(err as Error).message}) — repli ffmpeg`);
    }

    try {
      const jpeg = await this.withFfmpeg(input);
      await this.assertNotCropped(input, jpeg);
      return await this.withSharp(jpeg);
    } catch (err) {
      this.logger.warn(`Nettoyage d'image impossible, upload refusé : ${(err as Error).message}`);
      throw new BadRequestException('Image illisible');
    }
  }

  private async withSharp(input: Buffer): Promise<SanitizedImage> {
    const { format } = await sharp(input, { failOn: 'none' }).metadata();
    const kept = format && format in KEPT_FORMATS ? KEPT_FORMATS[format as keyof typeof KEPT_FORMATS] : null;

    // Pas de withMetadata()/keepExif() : sharp retire alors toutes les
    // métadonnées. rotate() sans argument redresse d'après l'orientation EXIF,
    // qui sinon serait perdue avec le reste.
    const pipeline = sharp(input, { failOn: 'none' }).rotate().keepIccProfile();

    if (kept?.ext === '.png') {
      return { buffer: await pipeline.png().toBuffer(), ...KEPT_FORMATS.png };
    }
    if (kept?.ext === '.webp') {
      return { buffer: await pipeline.webp({ quality: 90 }).toBuffer(), ...KEPT_FORMATS.webp };
    }
    // JPEG, et tout format décodable mais non servi tel quel (avif, tiff, gif…).
    return { buffer: await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer(), ...KEPT_FORMATS.jpeg };
  }

  private async withFfmpeg(input: Buffer): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'yumia-image-'));
    const src = join(dir, 'in');
    const out = join(dir, 'out.jpg');
    try {
      await writeFile(src, input);
      await execFileAsync('ffmpeg', imageFallbackArgs(src, out), {
        timeout: FFMPEG_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 5,
      });
      return await readFile(out);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Les HEIC d'iPhone sont découpés en tuiles de 512 px : un ffmpeg trop ancien
   * n'en sort que la première, sans erreur. Si l'en-tête (lisible par sharp
   * même sans décodeur HEVC) annonce une image nettement plus grande que ce
   * qu'a produit ffmpeg, on refuse plutôt que de publier un morceau de photo.
   */
  private async assertNotCropped(original: Buffer, converted: Buffer): Promise<void> {
    let expected = 0;
    try {
      const meta = await sharp(original, { failOn: 'none' }).metadata();
      expected = Math.max(meta.width ?? 0, meta.height ?? 0);
    } catch {
      return; // en-tête illisible : rien à comparer
    }
    if (!expected) return;
    const meta = await sharp(converted).metadata();
    const got = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (got < expected * 0.9) {
      throw new Error(`conversion partielle (${got}px pour ${expected}px attendus)`);
    }
  }
}
