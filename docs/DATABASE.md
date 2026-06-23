# YUMIA — Modèle de données

Schéma canonique : [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).
PostgreSQL est la **source de vérité**. Elasticsearch est un **index dérivé** (recherche géo),
Redis un **cache** — aucun des deux ne stocke d'état qui n'existe pas en base.

## Entités principales

| Modèle          | Rôle                                                                 |
|-----------------|----------------------------------------------------------------------|
| `User`          | Compte, profil, préférences (JSON), plan (free/plus), XP, niveau, i18n. |
| `RefreshToken`  | Rotation des refresh tokens (hash stocké, jamais le token en clair).  |
| `Place`         | Lieu (POI) typé par un des 14 `Universe`, géo (lat/lng), tags, métadonnées. |
| `Visit`         | Visite d'un lieu via YUMIA + feedback 1-tap (loved/neutral/disliked) + XP. |
| `SavedPlace`    | Favoris / listes (« à essayer ») — plafonné à 50 en Free.            |
| `EarnedBadge`   | Badges débloqués (clé = `Badge` de `@yumia/shared`).                 |
| `Streak`        | Série quotidienne, meilleur score, freezes (Plus).                  |
| `GroupSession` / `GroupMember` | Group Mode : invitation par code, votes (JSON), décision finale. |

## Choix de conception

- **Énumérations natives PostgreSQL** (`Universe`, `Plan`, `VisitFeedback`) — cohérence forte,
  alignées sur les constantes de `@yumia/shared` (même clés).
- **Champs `Json`** pour ce qui est volontairement flexible et amené à évoluer vite :
  `User.preferences` (restrictions alimentaires, univers favoris), `Place.metadata`,
  `GroupMember.votes`.
- **Index** orientés requêtes réelles : `Place(city, universe)`, `Place(countryCode)`,
  `Visit(userId, visitedAt)` — pensés multi-pays / fort volume.
- **`onDelete` explicites** : cascade sur les données dérivées d'un user, `SetNull` sur les
  membres de groupe (un user supprimé ne casse pas une session de groupe historique).

## Géolocalisation

Au MVP, `lat`/`lng` sont des `Float` indexables ; la recherche « autour de moi » passe par
**Elasticsearch** (geo_point) pour la latence. Si l'on veut des requêtes géo directes en SQL à
l'échelle, on activera **PostGIS** (migration additive, sans rupture du modèle).

## Conformité

Suppression de compte = cascade RGPD/CCPA/LGPD sur visites, favoris, badges, streak, tokens.
Les données partagées avec des partenaires sont anonymisées en amont (jamais d'ID utilisateur brut).
