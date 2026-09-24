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
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { AppConfig } from '../../config/configuration';

/** Extensions qu'on accepte de servir ; tout le reste est enregistré en `.bin`. */
const SAFE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif',
  '.mp4', '.mov', '.webm',
  '.m4a', '.mp3', '.aac', '.wav',
]);

/**
 * Nom de fichier d'un média envoyé par `ownerId` : l'identifiant en préfixe
 * permet ensuite de n'effacer que ses propres fichiers (cf. `remove`).
 */
export function ownedFilename(ownerId: string, ext: string): string {
  return `${ownerId}_${randomUUID()}${ext}`;
}

/**
 * `dossier/fichier` strict (aucun `..`, aucun sous-dossier) dont le fichier
 * appartient à `ownerId`. Les fichiers envoyés avant l'ajout du préfixe ne
 * sont jamais effacés : mieux vaut un orphelin qu'un fichier d'autrui supprimé.
 */
export function isOwnedKey(key: string, ownerId: string): boolean {
  if (!ownerId || !/^[a-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(key)) return false;
  return key.split('/')[1].startsWith(`${ownerId}_`);
}

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
   *
   * `fixedFilename` force le nom du fichier au lieu d'en générer un aléatoire :
   * c'est ce qui permet de **remplacer** un fichier déjà publié à la même URL
   * (utilisé par le ré-encodage vidéo en tâche de fond, qui écrase la version
   * remuxée servie immédiatement — cf. VideoTranscodeService).
   */
  async save(buffer: Buffer, originalName: string, subPath: string, fixedFilename?: string): Promise<string> {
    // Extension imposée par une liste fermée : un nom d'origine « x.html » ou
    // « x.js » ferait servir une page ou un script depuis notre domaine.
    const ext = SAFE_EXTENSIONS.has(extname(originalName).toLowerCase()) ? extname(originalName).toLowerCase() : '.bin';
    const filename = fixedFilename ?? `${randomUUID()}${ext}`;

    // Router sur le client réellement initialisé : provider=s3 sans credentials
    // doit retomber sur disk (sinon chaque upload jette « S3 non initialisé »).
    if (this.s3) {
      return this.uploadToS3(buffer, `${subPath}/${filename}`, originalName);
    }
    return this.writeToDisk(buffer, subPath, filename);
  }

  /**
   * Supprime un fichier à partir de son URL publique.
   *
   * Sans cette méthode, rien n'effaçait jamais rien : une story expirée, une
   * publication retirée ou un compte supprimé laissaient leurs vidéos sur le
   * disque pour toujours. Relevé en production le 15/09/2026 — 55 fichiers
   * orphelins sur 59, 500 Mo perdus pour quatre publications vivantes.
   *
   * Ne lève jamais : un fichier déjà absent, une URL d'un autre domaine ou un
   * S3 indisponible ne doivent pas faire échouer la suppression du contenu
   * lui-même, qui est la partie qui compte pour l'utilisateur.
   */
  async remove(url: string | null | undefined, ownerId: string): Promise<boolean> {
    const key = this.keyFromUrl(url);
    // Une URL de média vient du client (création d'un post, d'une story…) :
    // sans ce contrôle, publier puis supprimer un post pointant sur le fichier
    // d'un autre effaçait ce fichier. On n'efface donc que les fichiers dont
    // le nom porte l'identifiant du propriétaire du contenu supprimé.
    if (!key || !isOwnedKey(key, ownerId)) return false;
    try {
      if (this.s3) {
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.cfg.s3Bucket, Key: key }));
      } else {
        await unlink(join(process.cwd(), 'uploads', key));
      }
      return true;
    } catch {
      return false; // déjà supprimé, ou hors de notre stockage
    }
  }

  /** Supprime plusieurs fichiers, sans s'arrêter au premier échec. */
  async removeMany(urls: Array<string | null | undefined>, ownerId: string): Promise<number> {
    const results = await Promise.all(urls.map((u) => this.remove(u, ownerId)));
    return results.filter(Boolean).length;
  }

  /**
   * `dossier/fichier.mp4` extrait d'une URL publique, ou `null` si l'URL ne
   * désigne pas un de nos fichiers.
   *
   * Le découpage se fait sur `/uploads/` côté disque, et sur le dernier
   * segment connu côté S3 : les deux formes d'URL cohabitent en base, une
   * migration de stockage ne réécrit pas les anciennes lignes.
   */
  private keyFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const path = url.split('?')[0];
    const marker = '/uploads/';
    const at = path.indexOf(marker);
    if (at >= 0) return path.slice(at + marker.length) || null;

    // URL S3 : on garde les deux derniers segments (dossier/fichier).
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const key = parts.slice(-2).join('/');
    return key.includes('.') ? key : null;
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
    // audio (previews musicaux, messages vocaux) — le Content-Type est requis
    // pour qu'iOS/AVFoundation accepte de décoder le flux.
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    // vidéo (reels, stories)
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}
