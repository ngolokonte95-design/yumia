import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { ImageSanitizeService, imageFallbackArgs } from '../image-sanitize.service';

/** Photo de test portant une position GPS (Paris) et une orientation EXIF « 90° ». */
async function photoWithGps(format: 'jpeg' | 'png' | 'webp', orientation = 1): Promise<Buffer> {
  const base = sharp({
    create: { width: 40, height: 20, channels: 3, background: { r: 200, g: 50, b: 50 } },
  }).withExif({
    IFD0: { Make: 'TestPhone' },
    IFD3: {
      GPSLatitudeRef: 'N',
      GPSLatitude: '48/1 51/1 2400/100',
      GPSLongitudeRef: 'E',
      GPSLongitude: '2/1 21/1 300/100',
    },
  // sharp réécrit lui-même la balise d'orientation : elle se passe ici.
  }).withMetadata({ orientation });
  return base.toFormat(format).toBuffer();
}

/** Pointeur vers l'IFD GPS (balise 0x8825), en little- ou big-endian. */
function hasGpsIfd(buf: Buffer): boolean {
  return buf.includes(Buffer.from([0x25, 0x88])) || buf.includes(Buffer.from([0x88, 0x25]));
}

describe('ImageSanitizeService', () => {
  const service = new ImageSanitizeService();

  it('la photo de test contient bien un bloc GPS (garde-fou du test)', async () => {
    const input = await photoWithGps('jpeg');
    const meta = await sharp(input).metadata();
    expect(meta.exif).toBeDefined();
    expect(hasGpsIfd(meta.exif!)).toBe(true);
    expect(input.includes(Buffer.from('Exif\0\0'))).toBe(true);
    expect(input.includes(Buffer.from('TestPhone'))).toBe(true);
  });

  it('JPEG : retire tout le bloc EXIF (GPS compris) et garde le format', async () => {
    const out = await service.sanitize(await photoWithGps('jpeg'));
    const meta = await sharp(out.buffer).metadata();

    expect(out.ext).toBe('.jpg');
    expect(out.mime).toBe('image/jpeg');
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(out.buffer.includes(Buffer.from('Exif\0\0'))).toBe(false);
    expect(out.buffer.includes(Buffer.from('TestPhone'))).toBe(false);
  });

  it.each([['png', '.png'], ['webp', '.webp']] as const)('%s : métadonnées retirées, format conservé', async (format, ext) => {
    const out = await service.sanitize(await photoWithGps(format));
    const meta = await sharp(out.buffer).metadata();

    expect(out.ext).toBe(ext);
    expect(meta.format).toBe(format);
    expect(meta.exif).toBeUndefined();
    expect(out.buffer.includes(Buffer.from('TestPhone'))).toBe(false);
  });

  it("applique l'orientation EXIF aux pixels avant de la perdre", async () => {
    // Orientation 6 = rotation de 90° : l'image 40×20 doit ressortir en 20×40.
    const out = await service.sanitize(await photoWithGps('jpeg', 6));
    const meta = await sharp(out.buffer).metadata();

    expect(meta.width).toBe(20);
    expect(meta.height).toBe(40);
    expect(meta.orientation).toBeUndefined();
  });

  it("refuse (400) un fichier illisible au lieu de stocker l'original", async () => {
    await expect(service.sanitize(Buffer.from('pas une image du tout'))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('imageFallbackArgs (repli ffmpeg, HEIC)', () => {
  it('ne recopie aucune métadonnée et place les options de sortie entre entrée et sortie', () => {
    const args = imageFallbackArgs('/tmp/in', '/tmp/out.jpg');
    const i = args.indexOf('-map_metadata');

    expect(args[i + 1]).toBe('-1');
    expect(i).toBeGreaterThan(args.indexOf('-i'));
    expect(args[args.length - 1]).toBe('/tmp/out.jpg');
  });
});
