/**
 * StorageService — abstraction disk/S3 pour les uploads de fichiers.
 *
 * En développement (STORAGE_PROVIDER=disk) : écrit dans `<cwd>/uploads/`.
 * En production (STORAGE_PROVIDER=s3) : stream vers S3 (ou S3-compatible via endpoint).
 *
 * L'URL publique retournée est directement exploitable en frontend.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { AppConfig } from '../../config/configuration';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null = null;
  private readonly cfg: AppConfig['storage'];

  constructor(private readonly config: ConfigService) {
    this.cfg = config.get<AppConfig['storage']>('storage')!;

    const hasS3Creds = !!(this.cfg.s3AccessKeyId && this.cfg.s3SecretAccessKey);
    const useS3 = this.cfg.provider === 's3' && hasS3Creds;

    if (useS3) {
      const s3Config: S3ClientConfig = {
        region: this.cfg.s3Region,
        credentials: {
          accessKeyId: this.cfg.s3AccessKeyId,
          secretAccessKey: this.cfg.s3SecretAccessKey,
        },
      };
      if (this.cfg.s3Endpoint) {
        s3Config.endpoint = this.cfg.s3Endpoint;
        s3Config.forcePathStyle = true;
      }
      this.s3 = new S3Client(s3Config);
      this.logger.log(`Storage → S3 (bucket: ${this.cfg.s3Bucket})`);
    } else {
      if (this.cfg.provider === 's3') {
        this.logger.warn('Storage → credentials S3 manquants, fallback sur disk (uploads/)');
      } else {
        this.logger.log('Storage → disk (uploads/)');
      }
    }
  }

  /**
   * Sauvegarde un buffer en fichier. `subPath` est le dossier de destination
   * (ex. `'places'`). Retourne l'URL publique.
   */
  async save(buffer: Buffer, originalName: string, subPath: string): Promise<string> {
    const ext = extname(originalName).toLowerCase() || '.bin';
    const filename = `${randomUUID()}${ext}`;

    if (this.cfg.provider === 's3') {
      return this.uploadToS3(buffer, `${subPath}/${filename}`, originalName);
    }
    return this.writeToDisk(buffer, subPath, filename);
  }

  private async uploadToS3(buffer: Buffer, key: string, originalName: string): Promise<string> {
    if (!this.s3) throw new Error('S3 client non initialisé.');

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.cfg.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeFromName(originalName),
        ACL: 'public-read',
      },
    });

    await upload.done();

    // Use CDN / custom public base URL when configured (e.g. CloudFront).
    if (this.cfg.publicBaseUrl && !this.cfg.publicBaseUrl.startsWith('http://localhost')) {
      return `${this.cfg.publicBaseUrl}/${key}`;
    }
    if (this.cfg.s3Endpoint) {
      return `${this.cfg.s3Endpoint}/${this.cfg.s3Bucket}/${key}`;
    }
    return `https://${this.cfg.s3Bucket}.s3.${this.cfg.s3Region}.amazonaws.com/${key}`;
  }

  private async writeToDisk(buffer: Buffer, subPath: string, filename: string): Promise<string> {
    const dir = join(process.cwd(), 'uploads', subPath);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), buffer);
    const base = (this.cfg.publicBaseUrl || process.env.API_PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
    return `${base}/uploads/${subPath}/${filename}`;
  }
}

function mimeFromName(name: string): string {
  const ext = extname(name).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
  };
  return map[ext] ?? 'application/octet-stream';
}
