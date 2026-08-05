import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Espace Favoris unifié.
 *
 * Jusqu'ici, deux systèmes cohabitaient sans se parler : les lieux
 * (`SavedPlace`) et les publications enregistrées (`PostSave`), ces dernières
 * seules capables d'être rangées en collections. Ce service les réunit derrière
 * une seule API, et permet à une collection de contenir les deux.
 *
 * Volontairement **additif** : les endpoints `/saved` et `/posts/collections`
 * existants continuent de fonctionner à l'identique.
 */

export type FavoriteKind = 'place' | 'post';

export interface FavoriteItem {
  /** Discriminant — permet à l'UI de choisir le rendu sans deviner. */
  kind: FavoriteKind;
  /** Identifiant du lieu ou du post. */
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  /** Univers Yumia pour un lieu ; absent pour une publication. */
  universe: string | null;
  collectionId: string | null;
  savedAt: Date;
}

export interface FavoriteCollection {
  id: string;
  name: string;
  coverUrl: string | null;
  placesCount: number;
  postsCount: number;
  itemsCount: number;
  createdAt: Date;
}

export type FavoriteSort = 'recent' | 'oldest' | 'name';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liste unifiée des favoris.
   *
   * Les deux sources sont interrogées en parallèle puis fusionnées et triées en
   * mémoire. C'est assumé : un utilisateur a au plus quelques centaines de
   * favoris, et une union SQL sur deux tables aux formes très différentes
   * coûterait plus cher en complexité qu'elle ne rapporterait.
   */
  async list(
    userId: string,
    opts: { collectionId?: string; query?: string; sort?: FavoriteSort; kind?: FavoriteKind } = {},
  ): Promise<FavoriteItem[]> {
    const { collectionId, query, sort = 'recent', kind } = opts;

    const where = { userId, ...(collectionId ? { collectionId } : {}) };

    const places = kind === 'post' ? [] : await this.prisma.savedPlace.findMany({
      where,
      include: { place: true },
      orderBy: { createdAt: 'desc' },
    });

    const postSaves = kind === 'place' ? [] : await this.prisma.postSave.findMany({
      where,
      include: { post: true },
      orderBy: { createdAt: 'desc' },
    });

    // `Post` ne porte pas de relation vers son auteur (seulement `userId`) :
    // on résout les noms en une seule requête groupée plutôt qu'un include.
    const authorIds = [...new Set(postSaves.map((s) => s.post.userId))];
    const authors = authorIds.length === 0 ? [] : await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, displayName: true },
    });
    const authorName = new Map(authors.map((a) => [a.id, a.displayName]));

    const items: FavoriteItem[] = [
      ...places.map((s): FavoriteItem => ({
        kind: 'place',
        id: s.place.id,
        title: s.place.name,
        subtitle: s.place.city || null,
        imageUrl: s.place.photoUrls[0] ?? null,
        universe: s.place.universe,
        collectionId: s.collectionId,
        savedAt: s.createdAt,
      })),
      ...postSaves.map((s): FavoriteItem => {
        const author = authorName.get(s.post.userId) ?? 'Yumia';
        return {
          kind: 'post',
          id: s.postId,
          // Une publication n'a pas de nom : la légende en tient lieu, tronquée.
          title: s.post.caption?.slice(0, 80) || `Publication de ${author}`,
          subtitle: author,
          imageUrl: s.post.coverUrl ?? s.post.mediaUrls[0] ?? null,
          universe: null,
          collectionId: s.collectionId,
          savedAt: s.createdAt,
        };
      }),
    ];

    const needle = query?.trim().toLowerCase();
    const filtered = needle
      ? items.filter((i) => i.title.toLowerCase().includes(needle)
        || (i.subtitle?.toLowerCase().includes(needle) ?? false))
      : items;

    return filtered.sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title, 'fr');
      const delta = a.savedAt.getTime() - b.savedAt.getTime();
      return sort === 'oldest' ? delta : -delta;
    });
  }

  /** Collections avec le décompte réel de chaque type. */
  async listCollections(userId: string): Promise<FavoriteCollection[]> {
    const collections = await this.prisma.savedCollection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (collections.length === 0) return [];

    const ids = collections.map((c) => c.id);
    const [placeCounts, postCounts] = await Promise.all([
      this.prisma.savedPlace.groupBy({
        by: ['collectionId'],
        where: { userId, collectionId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.postSave.groupBy({
        by: ['collectionId'],
        where: { userId, collectionId: { in: ids } },
        _count: { _all: true },
      }),
    ]);

    const placeMap = new Map(placeCounts.map((c) => [c.collectionId, c._count._all]));
    const postMap = new Map(postCounts.map((c) => [c.collectionId, c._count._all]));

    return collections.map((c) => {
      const placesCount = placeMap.get(c.id) ?? 0;
      const postsCount = postMap.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        coverUrl: c.coverUrl,
        placesCount,
        postsCount,
        itemsCount: placesCount + postsCount,
        createdAt: c.createdAt,
      };
    });
  }

  async createCollection(userId: string, name: string): Promise<FavoriteCollection> {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Nom de collection requis.');

    const created = await this.prisma.savedCollection.create({
      data: { userId, name: trimmed },
    });
    return {
      id: created.id,
      name: created.name,
      coverUrl: created.coverUrl,
      placesCount: 0,
      postsCount: 0,
      itemsCount: 0,
      createdAt: created.createdAt,
    };
  }

  async renameCollection(userId: string, collectionId: string, name: string): Promise<void> {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Nom de collection requis.');
    await this.assertOwnership(userId, collectionId);
    await this.prisma.savedCollection.update({
      where: { id: collectionId },
      data: { name: trimmed },
    });
  }

  /**
   * Supprime une collection sans supprimer son contenu : les lieux et
   * publications reviennent simplement dans les favoris non rangés. Supprimer
   * les favoris eux-mêmes serait une perte de données inattendue.
   */
  async deleteCollection(userId: string, collectionId: string): Promise<void> {
    await this.assertOwnership(userId, collectionId);
    await this.prisma.$transaction([
      this.prisma.savedPlace.updateMany({
        where: { userId, collectionId },
        data: { collectionId: null },
      }),
      this.prisma.postSave.updateMany({
        where: { userId, collectionId },
        data: { collectionId: null },
      }),
      this.prisma.savedCollection.delete({ where: { id: collectionId } }),
    ]);
  }

  /** Range un lieu dans une collection, ou l'en retire avec `null`. */
  async setPlaceCollection(
    userId: string, placeId: string, collectionId: string | null,
  ): Promise<void> {
    if (collectionId) await this.assertOwnership(userId, collectionId);

    const updated = await this.prisma.savedPlace.updateMany({
      where: { userId, placeId },
      data: { collectionId },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Ce lieu n\'est pas dans tes favoris.');
    }
    if (collectionId) await this.ensureCover(collectionId, placeId);
  }

  /** Range une publication dans une collection, ou l'en retire avec `null`. */
  async setPostCollection(
    userId: string, postId: string, collectionId: string | null,
  ): Promise<void> {
    if (collectionId) await this.assertOwnership(userId, collectionId);

    const updated = await this.prisma.postSave.updateMany({
      where: { userId, postId },
      data: { collectionId },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Cette publication n\'est pas dans tes favoris.');
    }
  }

  private async assertOwnership(userId: string, collectionId: string): Promise<void> {
    const col = await this.prisma.savedCollection.findUnique({
      where: { id: collectionId },
      select: { userId: true },
    });
    if (!col) throw new NotFoundException('Collection introuvable.');
    if (col.userId !== userId) throw new ForbiddenException('Collection d\'un autre utilisateur.');
  }

  /** Donne une couverture à la collection si elle n'en a pas encore. */
  private async ensureCover(collectionId: string, placeId: string): Promise<void> {
    const col = await this.prisma.savedCollection.findUnique({
      where: { id: collectionId },
      select: { coverUrl: true },
    });
    if (col?.coverUrl) return;

    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { photoUrls: true },
    });
    const cover = place?.photoUrls[0];
    if (!cover) return;

    await this.prisma.savedCollection.update({
      where: { id: collectionId },
      data: { coverUrl: cover },
    });
  }
}
