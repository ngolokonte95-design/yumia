import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { adultBirthYearFilter, isAdult } from '../../infra/privacy/privacy.service';

const KEY = (userId: string) => `user:loc:${userId}`;
/**
 * Position « Rencontres » : distincte de celle de la carte. Envoyée par l'app
 * ouverte, quel que soit l'écran, elle ne sert qu'à détecter les croisements
 * et n'apparaît ni sur la carte ni dans « à proximité ».
 */
const ENC_KEY = (userId: string) => `user:enc:${userId}`;
const TTL_SECONDS = 600; // 10 minutes sans update → invisible
/** Distance en deçà de laquelle deux membres « se croisent ». */
const ENCOUNTER_RADIUS_KM = 0.1;

export type LocationVisibility = 'off' | 'friends' | 'everyone' | 'map';

interface StoredLocation {
  lat: number;
  lng: number;
  visibility: LocationVisibility;
  updatedAt: string;
}

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Partage de position sur la carte / « à proximité ». Le client ne choisit
   * que d'arrêter (`off`) : l'audience vient du réglage `mapAudience` de
   * l'utilisateur, pour qu'aucune version de l'app ne puisse l'élargir.
   */
  async updateLocation(userId: string, lat: number, lng: number, visibility: LocationVisibility = 'friends') {
    if (visibility === 'off') {
      await this.redis.raw.del(KEY(userId));
      return { status: 'hidden' };
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { mapAudience: true } });
    const effective: LocationVisibility = user?.mapAudience === 'everyone' ? 'map' : 'friends';
    const data: StoredLocation = { lat, lng, visibility: effective, updatedAt: new Date().toISOString() };
    await this.redis.raw.setex(KEY(userId), TTL_SECONDS, JSON.stringify(data));
    return { status: 'ok', visibility: effective };
  }

  /**
   * Position « Rencontres » (PUT /location/encounter), ignorée si les
   * Rencontres sont désactivées.
   */
  async updateEncounterLocation(userId: string, lat: number, lng: number) {
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { shareEncounters: true } });
    if (!me?.shareEncounters) {
      await this.redis.raw.del(ENC_KEY(userId));
      return { status: 'disabled' };
    }
    const data = { lat, lng, updatedAt: new Date().toISOString() };
    await this.redis.raw.setex(ENC_KEY(userId), TTL_SECONDS, JSON.stringify(data));
    void this.recordEncounters(userId, lat, lng).catch((e: Error) =>
      this.logger.warn(`Rencontres non enregistrées : ${e.message}`),
    );
    return { status: 'ok' };
  }

  /**
   * Enregistre une rencontre avec chaque membre à moins de 100 m, à des
   * conditions qui la rendent inutilisable pour pister quelqu'un :
   * - les deux ont activé les Rencontres (`shareEncounters`) et partagent
   *   leur position. Activer les Rencontres, c'est consentir à croiser des
   *   inconnus : le but est d'en rencontrer de nouveaux, donc aucun lien
   *   d'abonnement n'est exigé — la visibilité « amis » de la position ne
   *   régit que la carte et « à proximité », pas les Rencontres ;
   * - aucun blocage, dans un sens ou dans l'autre ;
   * - on ne garde ni le lieu ni l'heure : une ligne par paire et par jour.
   * Aucune notification : la rencontre s'affiche après coup (voir
   * DiscoverService.getMyEncounters).
   */
  private async recordEncounters(userId: string, lat: number, lng: number) {
    const near: string[] = [];
    for (const key of await this.redis.raw.keys('user:enc:*')) {
      const uid = key.replace('user:enc:', '');
      if (uid === userId) continue;
      const raw = await this.redis.raw.get(key);
      if (!raw) continue;
      try {
        const loc = JSON.parse(raw) as { lat: number; lng: number };
        if (this.haversineKm(lat, lng, loc.lat, loc.lng) <= ENCOUNTER_RADIUS_KM) {
          near.push(uid);
        }
      } catch {
        // JSON corrompu, on ignore
      }
    }
    if (near.length === 0) return;

    // Rencontres réservées aux majeurs : aucune ligne n'est créée si l'un des
    // deux ne l'est pas de façon certaine.
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { birthYear: true } });
    if (!isAdult(me?.birthYear)) return;

    const ids = near;
    const [optedIn, blocks] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids }, shareEncounters: true, ...adultBirthYearFilter() }, select: { id: true } }),
      this.prisma.block.findMany({
        where: { OR: [{ blockerId: userId, blockedId: { in: ids } }, { blockedId: userId, blockerId: { in: ids } }] },
      }),
    ]);
    const opted = new Set(optedIn.map((u) => u.id));
    const blocked = new Set(blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));

    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    for (const uid of near) {
      if (!opted.has(uid) || blocked.has(uid)) continue;
      const [userAId, userBId] = [userId, uid].sort();
      await this.prisma.encounter.upsert({
        where: { userAId_userBId_day: { userAId, userBId, day } },
        update: { seenAt: now },
        create: { userAId, userBId, day, seenAt: now },
      });
    }
  }

  async hideLocation(userId: string) {
    await this.redis.raw.del(KEY(userId));
  }

  /** Coupe la position Rencontres (Rencontres désactivées). */
  async hideEncounterLocation(userId: string) {
    await this.redis.raw.del(ENC_KEY(userId));
  }

  /**
   * @param friendIds abonnements MUTUELS du lecteur : seuls eux voient une
   *   position partagée « aux amis ». Suivre quelqu'un ne suffit pas.
   * @param blockedIds exclus dans les deux sens.
   */
  async getNearbyUsers(
    lat: number,
    lng: number,
    radiusKm: number,
    viewerId: string,
    friendIds: string[],
    blockedIds: string[] = [],
  ): Promise<Array<{ userId: string; lat: number; lng: number; distanceKm: number }>> {
    // Récupère toutes les locations actives
    const keys = await this.redis.raw.keys('user:loc:*');
    const results: Array<{ userId: string; lat: number; lng: number; distanceKm: number }> = [];

    for (const key of keys) {
      const raw = await this.redis.raw.get(key);
      if (!raw) continue;
      try {
        const loc = JSON.parse(raw) as StoredLocation;
        const uid = key.replace('user:loc:', '');
        if (uid === viewerId || blockedIds.includes(uid)) continue;

        if (loc.visibility === 'friends' && !friendIds.includes(uid)) continue;
        if (loc.visibility === 'off') continue;

        const dist = this.haversineKm(lat, lng, loc.lat, loc.lng);
        if (dist <= radiusKm) {
          results.push({ userId: uid, lat: loc.lat, lng: loc.lng, distanceKm: Math.round(dist * 10) / 10 });
        }
      } catch {
        // JSON corrompu, on ignore
      }
    }

    return results.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
