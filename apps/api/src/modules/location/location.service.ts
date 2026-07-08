import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';

const KEY = (userId: string) => `user:loc:${userId}`;
const TTL_SECONDS = 600; // 10 minutes sans update → invisible

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

  constructor(private readonly redis: RedisService) {}

  async updateLocation(userId: string, lat: number, lng: number, visibility: LocationVisibility = 'friends') {
    if (visibility === 'off') {
      await this.redis.raw.del(KEY(userId));
      return { status: 'hidden' };
    }
    const data: StoredLocation = { lat, lng, visibility, updatedAt: new Date().toISOString() };
    await this.redis.raw.setex(KEY(userId), TTL_SECONDS, JSON.stringify(data));
    return { status: 'ok' };
  }

  async hideLocation(userId: string) {
    await this.redis.raw.del(KEY(userId));
  }

  async getNearbyUsers(
    lat: number,
    lng: number,
    radiusKm: number,
    viewerId: string,
    followingIds: string[],
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
        if (uid === viewerId) continue;

        if (loc.visibility === 'friends' && !followingIds.includes(uid)) continue;
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
