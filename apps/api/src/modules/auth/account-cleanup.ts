/**
 * Nettoyages « hors base » de la suppression de compte : fichiers, Redis,
 * RevenueCat — et la collecte des médias à effacer, qui doit se faire AVANT
 * la transaction (après, les lignes qui portent les URLs n'existent plus).
 *
 * Tout ce qui est ici est best-effort : une panne de Redis, du disque ou de
 * RevenueCat ne doit pas empêcher l'effacement du compte lui-même, qui est la
 * partie exigée (RGPD art. 17, App Store 5.1.1(v)). Les échecs sont journalisés.
 */
import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { RedisService } from '../../infra/redis/redis.service';

/** Types de message dont le média a été ENVOYÉ par l'expéditeur (une réponse à une story pointe sur le fichier d'autrui). */
export const OWN_MEDIA_MESSAGE_TYPES = ['image', 'video', 'audio'] as const;

/** Mêmes clés que social.service.ts. */
const SOCIAL_EVENT_KEY = (id: string) => `social:event:${id}`;
const SOCIAL_EVENTS_INDEX = 'social:events:index';

/** `previewUrl` d'un `musicTrack` JSON (extrait musical envoyé par l'utilisateur), sinon null. */
export function musicPreviewUrl(musicTrack: string | null | undefined): string | null {
  if (!musicTrack) return null;
  try {
    const parsed = JSON.parse(musicTrack) as { previewUrl?: unknown };
    return typeof parsed?.previewUrl === 'string' ? parsed.previewUrl : null;
  } catch {
    return null; // ancien format texte « Titre - Artiste »
  }
}

/**
 * Toutes les URLs de médias envoyés par l'utilisateur. Le StorageService ne
 * supprime ensuite que celles dont le fichier porte son identifiant : une URL
 * d'autrui glissée dans un de ses contenus n'est jamais effacée.
 */
export async function collectOwnedMediaUrls(prisma: PrismaService, userId: string): Promise<string[]> {
  const [user, posts, stories, highlights, messages, notes, reviews, collections] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { photoUrl: true } }),
    prisma.post.findMany({
      where: { userId },
      select: { mediaUrls: true, videoUrl: true, coverUrl: true, voiceTrackUrl: true, musicTrack: true },
    }),
    prisma.story.findMany({ where: { userId }, select: { mediaUrl: true, musicTrack: true } }),
    prisma.storyHighlight.findMany({
      where: { userId },
      select: { coverUrl: true, items: { select: { mediaUrl: true } } },
    }),
    prisma.message.findMany({
      where: { senderId: userId, type: { in: [...OWN_MEDIA_MESSAGE_TYPES] }, mediaUrl: { not: null } },
      select: { mediaUrl: true },
    }),
    prisma.notebookNote.findMany({ where: { userId }, select: { photoUrls: true } }),
    prisma.placeReview.findMany({ where: { userId, photoUrl: { not: null } }, select: { photoUrl: true } }),
    prisma.savedCollection.findMany({ where: { userId, coverUrl: { not: null } }, select: { coverUrl: true } }),
  ]);

  const urls: Array<string | null | undefined> = [user?.photoUrl];
  for (const p of posts ?? []) {
    urls.push(...(p.mediaUrls ?? []), p.videoUrl, p.coverUrl, p.voiceTrackUrl, musicPreviewUrl(p.musicTrack));
  }
  for (const s of stories ?? []) urls.push(s.mediaUrl, musicPreviewUrl(s.musicTrack));
  for (const h of highlights ?? []) urls.push(h.coverUrl, ...(h.items ?? []).map((i) => i.mediaUrl));
  for (const m of messages ?? []) urls.push(m.mediaUrl);
  for (const n of notes ?? []) urls.push(...(n.photoUrls ?? []));
  for (const r of reviews ?? []) urls.push(r.photoUrl);
  for (const c of collections ?? []) urls.push(c.coverUrl);

  return [...new Set(urls.filter((u): u is string => typeof u === 'string' && u.length > 0))];
}

/**
 * Efface l'état Redis de l'utilisateur : position sur la carte (`user:loc`),
 * présence Rencontres (`user:enc`), signal de sortie (`social:intent`),
 * profils déjà vus (`swipe:seen`), cache des favoris (`saved:ids`), compteurs
 * de quota (`quota:…:u:{id}:…`), caches de stats (`heatmap:{id}:…`,
 * `universe:breakdown:{id}`, `visit:idem:{id}:…`). Les identifiants étant des
 * UUID, un SCAN sur `*{id}*` les attrape tous sans risque de collision.
 *
 * Les sorties de groupe (`social:event:*`) qu'il a créées sont supprimées ;
 * celles qu'il avait rejointes le perdent de leurs participants.
 */
export async function purgeUserRedisState(redis: RedisService, userId: string, logger: Logger): Promise<void> {
  const client = redis.raw;
  if (!client) return;

  try {
    const keys = new Set<string>([
      `user:loc:${userId}`,
      `user:enc:${userId}`,
      `social:intent:${userId}`,
      `swipe:seen:${userId}`,
      `saved:ids:${userId}`,
    ]);
    let cursor = '0';
    do {
      const [next, batch] = await client.scan(cursor, 'MATCH', `*${userId}*`, 'COUNT', 500);
      cursor = next;
      batch.forEach((k) => keys.add(k));
    } while (cursor !== '0');
    await client.del(...keys);
  } catch (err) {
    logger.warn(`Suppression de compte ${userId} : clés Redis non effacées (${(err as Error).message})`);
  }

  try {
    const ids = (await client.zrange(SOCIAL_EVENTS_INDEX, 0, -1)) as string[];
    for (const id of ids) {
      const raw = await client.get(SOCIAL_EVENT_KEY(id));
      if (!raw) continue;
      const event = JSON.parse(raw) as { creatorId?: string; participants?: string[] };
      if (event.creatorId === userId) {
        await client.del(SOCIAL_EVENT_KEY(id));
        await client.zrem(SOCIAL_EVENTS_INDEX, id);
      } else if (event.participants?.includes(userId)) {
        event.participants = event.participants.filter((p) => p !== userId);
        const ttl = await client.ttl(SOCIAL_EVENT_KEY(id));
        if (ttl > 0) await client.setex(SOCIAL_EVENT_KEY(id), ttl, JSON.stringify(event));
      }
    }
  } catch (err) {
    logger.warn(`Suppression de compte ${userId} : sorties de groupe non nettoyées (${(err as Error).message})`);
  }
}

/**
 * Supprime le client RevenueCat (historique d'achats, attributs) :
 * `DELETE /v1/subscribers/{app_user_id}`. L'app_user_id est l'UUID YUMIA
 * (Purchases.logIn(user.id) côté mobile). Sans clé secrète configurée, rien
 * n'est tenté. Un abonnement actif n'est PAS résilié par cet appel : la
 * résiliation se fait dans les réglages de l'App Store / Google Play.
 */
export async function deleteRevenueCatSubscriber(
  secretApiKey: string | undefined,
  userId: string,
  logger: Logger,
): Promise<void> {
  if (!secretApiKey) return;
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secretApiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    // 404 : jamais passé par RevenueCat — rien à effacer.
    if (!res.ok && res.status !== 404) {
      logger.warn(`Suppression de compte ${userId} : RevenueCat a répondu HTTP ${res.status}`);
    }
  } catch (err) {
    logger.warn(`Suppression de compte ${userId} : RevenueCat injoignable (${(err as Error).message})`);
  }
}
