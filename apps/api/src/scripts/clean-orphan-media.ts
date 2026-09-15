/**
 * Supprime les fichiers d'upload que plus aucune ligne ne référence.
 *
 * Jusqu'au 15/09/2026, rien n'effaçait jamais un fichier : une story expirée,
 * une publication retirée ou un compte supprimé laissaient leurs médias sur le
 * disque. Relevé en production ce jour-là : 55 fichiers orphelins sur 59, soit
 * 500 Mo pour quatre publications vivantes.
 *
 * La fuite est colmatée à la source (StorageService.remove, appelé à
 * l'expiration d'une story, à la suppression d'une publication et par la
 * modération). Ce script règle le passé — et sert de filet si un chemin de
 * suppression est oublié un jour.
 *
 * Ne touche qu'au stockage disque : en S3, lister le bucket demanderait une
 * autre mécanique, et ce n'est pas le cas d'aujourd'hui.
 *
 * Usage (dans le conteneur) :
 *   node dist/scripts/clean-orphan-media.js          # aperçu
 *   node dist/scripts/clean-orphan-media.js --yes    # suppression
 */
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const UPLOADS = join(process.cwd(), 'uploads');

/**
 * Les URL ne sont pas toutes dans des colonnes d'URL.
 *
 * `musicTrack` est une colonne TEXTE qui contient un JSON
 * `{ title, artist, artworkUrl, previewUrl, … }` : l'extrait musical joué par
 * une story y est référencé, invisible d'un simple `select`. Sans ce
 * décodage, ce script supprimerait des musiques encore utilisées — il a
 * justement fallu le vérifier avant de le lancer la première fois.
 */
function urlsInsideJson(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim().startsWith('{')) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.values(parsed).filter((v): v is string => typeof v === 'string' && v.includes('/'));
  } catch {
    return [];
  }
}

/** Nom de fichier extrait d'une URL publique, quelle qu'en soit la forme. */
function fileNameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const name = url.split('?')[0].split('/').pop();
  return name && name.includes('.') ? name : null;
}

/** Tous les noms de fichiers encore référencés, toutes tables confondues. */
async function referencedNames(): Promise<Set<string>> {
  const referenced = new Set<string>();
  const add = (url: string | null | undefined) => {
    const name = fileNameOf(url);
    if (name) referenced.add(name);
  };

  const [posts, stories, users, messages, places] = await Promise.all([
    prisma.post.findMany({
      select: {
        mediaUrls: true,
        videoUrl: true,
        coverUrl: true,
        voiceTrackUrl: true,
        musicTrack: true,
      },
    }),
    prisma.story.findMany({ select: { mediaUrl: true, musicTrack: true } }),
    prisma.user.findMany({ select: { photoUrl: true } }),
    prisma.message.findMany({ select: { mediaUrl: true } }).catch(() => []),
    prisma.place.findMany({ select: { photoUrls: true } }).catch(() => []),
  ]);

  for (const p of posts) {
    p.mediaUrls.forEach(add);
    add(p.videoUrl);
    add(p.coverUrl);
    add(p.voiceTrackUrl);
    urlsInsideJson(p.musicTrack).forEach(add);
  }
  for (const s of stories) {
    add(s.mediaUrl);
    urlsInsideJson(s.musicTrack).forEach(add);
  }
  for (const u of users) add(u.photoUrl);
  for (const m of messages as Array<{ mediaUrl: string | null }>) add(m.mediaUrl);
  for (const pl of places as Array<{ photoUrls: string[] }>) pl.photoUrls.forEach(add);

  return referenced;
}

/** Tous les fichiers présents sous `uploads/`, chemin complet. */
async function diskFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await diskFiles(full)));
    else files.push(full);
  }
  return files;
}

function human(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024).toFixed(0)} Ko`;
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--yes');

  const [referenced, files] = await Promise.all([referencedNames(), diskFiles(UPLOADS)]);
  console.log(`${files.length} fichier(s) sur le disque, ${referenced.size} référencé(s) en base.`);

  const orphans: Array<{ path: string; size: number }> = [];
  for (const path of files) {
    const name = path.split(/[\\/]/).pop()!;
    if (referenced.has(name)) continue;
    const info = await stat(path).catch(() => null);
    orphans.push({ path, size: info?.size ?? 0 });
  }

  if (orphans.length === 0) {
    console.log('Aucun orphelin. Rien à faire.');
    return;
  }

  const total = orphans.reduce((sum, o) => sum + o.size, 0);
  console.log(`\n${orphans.length} orphelin(s), ${human(total)} :`);
  for (const o of orphans.slice(0, 20)) {
    console.log(`  ${human(o.size).padStart(9)}  ${o.path.replace(UPLOADS, '')}`);
  }
  if (orphans.length > 20) console.log(`  … et ${orphans.length - 20} autre(s)`);

  if (!confirmed) {
    console.log('\nAperçu seulement. Relance avec --yes pour supprimer.');
    return;
  }

  let removed = 0;
  for (const o of orphans) {
    try {
      await unlink(o.path);
      removed += 1;
    } catch {
      // Déjà parti, ou permission refusée : on continue, le compte final le dira.
    }
  }
  console.log(`\n${removed} fichier(s) supprimé(s), ${human(total)} libéré(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
