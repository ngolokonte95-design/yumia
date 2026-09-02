/**
 * Rattrapage des miniatures (`coverUrl`) manquantes sur les posts vidéo publiés
 * AVANT l'ajout de la génération automatique de miniature côté serveur
 * (cf. VideoTranscodeService.prepare()). Sans coverUrl, le lecteur mobile
 * n'a rien à afficher pendant le chargement du lecteur → flash noir visible
 * pendant le scroll sur Android (iOS charge la vidéo une seule fois, sans
 * démontage/remontage répété, donc n'est pas concerné).
 *
 * Usage (dans le conteneur, après un build incluant ce script) :
 *   node dist/scripts/backfill-video-covers.js
 *
 * Lit directement les fichiers vidéo sur le volume `uploads` (storage disk,
 * config par défaut en prod) — repli en téléchargement HTTP sinon (storage S3
 * ou fichier introuvable localement pour une autre raison).
 */

import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

const THUMBNAIL_TIMEOUT_MS = 15_000;
// Traite quelques vidéos en parallèle plutôt qu'une par une — repris du même
// raisonnement que PERSIST_CONCURRENCY dans places.service.ts (VPS ~1 Go RAM,
// mais l'extraction d'une frame est légère comparée à un ré-encodage complet).
const CONCURRENCY = 4;

const uploadsDir = join(process.cwd(), 'uploads');
const publicBase = (process.env.STORAGE_PUBLIC_BASE_URL || process.env.API_PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes('/video');
}

/** Chemin local du fichier si l'URL pointe vers notre storage disk (`{base}/uploads/...`), sinon null. */
function localPathFor(url: string): string | null {
  const marker = '/uploads/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return join(uploadsDir, url.slice(idx + marker.length));
}

/** Récupère les octets vidéo : lecture disque directe si possible, sinon téléchargement HTTP. */
async function fetchVideoBytes(url: string): Promise<Buffer> {
  const local = localPathFor(url);
  if (local) {
    try {
      await access(local);
      return await readFile(local);
    } catch {
      // fichier absent localement (ex. storage S3) → repli HTTP ci-dessous
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function extractThumbnail(videoBuffer: Buffer, originalExt: string): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), 'yumia-cover-'));
  const input = join(dir, `in${originalExt || '.mp4'}`);
  const output = join(dir, 'thumb.jpg');
  try {
    await writeFile(input, videoBuffer);
    await execFileAsync('ffmpeg', [
      '-y', '-i', input, '-ss', '00:00:00.1', '-vframes', '1', '-q:v', '4', output,
    ], { timeout: THUMBNAIL_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 5 });
    return await readFile(output);
  } catch (err) {
    console.warn(`  ⚠ extraction échouée : ${(err as Error).message}`);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Sauvegarde la miniature sur le storage disk (même logique que StorageService.writeToDisk). */
async function saveThumbnail(buffer: Buffer): Promise<string> {
  const filename = `${randomUUID()}.jpg`;
  const dir = join(uploadsDir, 'posts');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return `${publicBase}/uploads/posts/${filename}`;
}

async function backfillOne(post: { id: string; videoUrl: string | null; mediaUrls: string[] }): Promise<'done' | 'skipped' | 'failed'> {
  const videoSrc = post.videoUrl ?? post.mediaUrls.find((u) => isVideoUrl(u));
  if (!videoSrc) return 'skipped';

  try {
    const videoBuffer = await fetchVideoBytes(videoSrc);
    const thumbnail = await extractThumbnail(videoBuffer, extname(videoSrc).split('?')[0] || '.mp4');
    if (!thumbnail) return 'failed';
    const coverUrl = await saveThumbnail(thumbnail);
    await prisma.post.update({ where: { id: post.id }, data: { coverUrl } });
    return 'done';
  } catch (err) {
    console.warn(`  ⚠ post ${post.id} : ${(err as Error).message}`);
    return 'failed';
  }
}

async function run() {
  const posts = await prisma.post.findMany({
    where: {
      coverUrl: null,
      OR: [
        { videoUrl: { not: null } },
        { mediaUrls: { isEmpty: false } },
      ],
    },
    select: { id: true, videoUrl: true, mediaUrls: true },
  });

  const candidates = posts.filter((p) => p.videoUrl || p.mediaUrls.some((u) => isVideoUrl(u)));
  console.log(`🎬 ${candidates.length} post(s) vidéo sans miniature (sur ${posts.length} posts sans coverUrl).`);

  let done = 0, skipped = 0, failed = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length) {
      const post = candidates[cursor];
      cursor += 1;
      const result = await backfillOne(post);
      if (result === 'done') done++;
      else if (result === 'skipped') skipped++;
      else failed++;
      if ((done + skipped + failed) % 20 === 0) {
        console.log(`  … ${done + skipped + failed}/${candidates.length} traités (${done} ok, ${failed} échecs)`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()));

  console.log(`✅ Terminé : ${done} miniature(s) générée(s), ${skipped} ignoré(s), ${failed} échec(s).`);
}

run()
  .catch((err) => {
    console.error('❌ Backfill échoué :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
