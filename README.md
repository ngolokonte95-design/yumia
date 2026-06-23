# 🌍 YUMIA — Le Copilote IA Mondial des Expériences

> YUMIA n'est pas une application de restaurants. C'est un **copilote IA des expériences du quotidien** :
> il transforme une envie floue (« j'ai faim », « je m'ennuie ») en destination précise, au bon moment,
> pour la bonne personne — partout dans le monde.

Ce dépôt est un **monolithe modulaire** organisé en monorepo, conçu pour passer à l'échelle de
dizaines de millions d'utilisateurs.

## 🧱 Architecture

```
yumia/
├── apps/
│   ├── api/        Backend — NestJS (Node + TypeScript), monolithe modulaire
│   └── mobile/     App mobile — React Native + Expo (5 onglets)
├── packages/
│   └── shared/     Modèle de domaine partagé (univers, modes, moteurs IA, gamification, i18n)
└── docs/           Architecture, schéma DB, roadmap
```

- **Backend** : NestJS, PostgreSQL (Prisma), Redis (cache), Elasticsearch (recherche).
- **IA** : abstraction multi-modèles. Fournisseur principal **Anthropic Claude**
  (`claude-sonnet-4-6` pour le raisonnement, `claude-haiku-4-5` pour le temps réel),
  prête à accueillir d'autres modèles.
- **Cartographie** : Mapbox / Google Maps interchangeables derrière une interface.
- **Mobile** : Expo + expo-router, design system premium (Duolingo × ChatGPT × Maps × Instagram × TikTok).

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour le détail des modules et des frontières.

## 🚀 Démarrage

Prérequis : **Node 20+**, **PostgreSQL 15+**, **Redis 7+** (Elasticsearch optionnel en dev).

```bash
# 1. Installer les dépendances (monorepo)
npm install

# 2. Configurer l'environnement
cp .env.example .env            # racine (mobile + outils)
cp apps/api/.env.example apps/api/.env

# 3. Construire le paquet partagé
npm run build:shared

# 4. Base de données (Prisma)
cd apps/api && npx prisma migrate dev && cd ../..

# 5. Lancer l'API
npm run dev:api                 # http://localhost:4000/api/health

# 6. Lancer l'app mobile
npm run dev:mobile              # Expo
```

> Sans clé Anthropic, mettez `AI_PROVIDER=mock` : les moteurs IA renvoient des réponses
> déterministes simulées, l'app reste pleinement navigable.

## 🧩 Modules du domaine

14 univers (restaurants, cafés, boulangeries, desserts, bars, bubble tea, spécialités locales,
glaciers, chocolatiers, caves à vin, activités touristiques, rooftops, sorties culturelles,
lieux de sortie) · 5 modes contextuels (Surprise Me, Date, Family, Group, Travel) ·
11 moteurs IA invisibles · gamification (XP, niveaux, badges, streaks) · Freemium (Free / Plus 2,99 €).

## 📍 État du projet

**Phase 0 — Fondations** (en cours) : monorepo, modèle de domaine, squelette backend modulaire
avec abstraction IA, schéma de base de données, squelette mobile à 5 onglets.

Suite : voir [`docs/ROADMAP.md`](docs/ROADMAP.md).
