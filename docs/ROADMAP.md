# YUMIA — Roadmap technique

Aligné sur la roadmap produit du PRD (MVP Q3 2026 → v2.0 Q2 2027).

## Phase 0 — Fondations *(en cours)*
- [x] Monorepo (npm workspaces) + tooling TypeScript.
- [x] Paquet partagé `@yumia/shared` : 14 univers, 5 modes, 11 moteurs IA, gamification, i18n.
- [x] Squelette API NestJS modulaire + config + health.
- [x] Abstraction IA multi-modèles (Anthropic + Mock) + EngineRegistry.
- [x] Schéma PostgreSQL (Prisma) couvrant users, places, visites, gamification, passeport.
- [x] Squelette mobile Expo : navigation 5 onglets + design system + écrans Home/For You.
- [ ] `npm install` + migration Prisma + premier `GET /api/health` vert.

## Phase 1 — MVP (cible Q3 2026)
- [~] Auth complète (JWT + OAuth Google/Apple) + onboarding « Aha moment < 90 s ».
  - [x] Module `auth` (API) : email/mot de passe, JWT access + refresh tokens opaques (hachés SHA-256, rotation + détection de rejeu), `JwtAuthGuard` + `@CurrentUser`, routes register/login/refresh/logout/me. Validé de bout en bout.
  - [x] Auth UI (mobile) : écrans Login/Register, `AuthProvider` (contexte + bootstrap + refresh auto), stockage sécurisé `expo-secure-store`, gate de redirection (layout racine), profil relié au vrai user + déconnexion. Flux complet validé contre l'API.
  - [ ] OAuth Google/Apple.
  - [ ] Onboarding « Aha moment < 90 s ».
- [~] `places` + ingestion POI + recherche géo.
  - [x] Module `places` : CRUD + liste paginée (filtre ville/univers) + recherche `nearby` (Haversine PostgreSQL, pré-filtre bounding-box, tri par distance). `POST /places` protégé par `JwtAuthGuard`. Script de seed (16 lieux Paris, 14 univers). Validé de bout en bout.
  - [ ] Recherche **Elasticsearch** géo (report d'échelle — cf. dette).
  - [ ] Ingestion POI réelle (source externe).
- [~] Moteurs **Mood / Food / Discovery / Top3** branchés sur de vraies données.
  - [x] Module `recommendations` : `POST /api/recommendations/top3` orchestre moteur IA `mood` → `places.nearby` → scoring (univers×note×distance) → 3 lieux réels. Renvoie le contrat partagé `Suggestion`/Top3. Dégradation propre en mode mock (tri note+distance). Validé de bout en bout.
  - [ ] Brancher Food / Discovery (et Top3 enrichi par une 2e passe IA d'explication par lieu — cf. Phase 2).
- [~] Home (Top 3 contextuel), Discovery Map, For You (algo V1), Date & Group modes.
  - [x] Mobile : client API typé (`lib/api.ts`, `lib/config.ts`), hook `useTop3` (loading/error/retry), écran Home branché sur `POST /recommendations/top3` (états chargement/erreur/vide + explication contextuelle). Contrat `Suggestion` validé de bout en bout ; `typecheck` mobile vert.
  - [x] Géolocalisation réelle (`expo-location`, hook `useLocation` : permission + repli Paris, fetch gated, indicateur « position approximative »). Validé : coords décalées → ranking distinct ; coords lointaines → liste vide gérée.
  - [x] Discovery Map : écran Carte branché sur `/places/nearby` (radar data-driven par projection lat/lng relative + drawer liste + filtres par univers). Tuiles Mapbox/Google → dette. Validé de bout en bout.
  - [x] For You : endpoint `POST /recommendations/feed` (pipeline IA+géo+scoring mutualisé avec Top 3, mood-aware, jusqu'à 20 items) + écran For You branché (flux vertical, filtre d'humeur, géoloc). Validé de bout en bout. `lib/mock.ts` supprimé (plus aucun écran mocké).
  - [ ] Date/Group modes.
- [~] Passeport V1 (50 lieux), Streaks + 12 badges, Travel Mode basique.
  - [x] API module `passport` : visites (XP avec plafonds quotidiens + bonus nouvel univers/pays + paliers streak/7), niveaux, streaks, 12 badges (logique pure testable), favoris (plafond Free 50). Routes protégées. Validé de bout en bout.
  - [x] Mobile : écran Passeport branché (stats, progression de niveau, agrégats, badges gagnés, pull-to-refresh) ; action « J'y suis allé » sur les cartes Home → +XP. Boucle complète validée.
  - [ ] Travel Mode basique, carte du monde réelle, badges avancés (sushi_master, etc.).
- [ ] Freemium Free/Plus (2,99 €), 5 langues (fr, en, es, pt, ar).

## Phase 2 — v1.1 / v1.2 (Q4 2026 → Q1 2027)
- [ ] Family Mode, Surprise Me affiné, Top 3 avec explications détaillées.
- [ ] Experience Builder AI (soirée complète), Memory AI, Weather AI.
- [ ] Mode offline, YUMIA Originals, classements amis/mondial, réservation partenaires.

## Phase 3 — v2.0+ (Q2 2027+)
- [ ] YUMIA Business (dashboard partenaires) + API publique.
- [ ] Intégration vocale, Watch App, marketplace, Creator Program.
- [ ] Déploiement 50+ → 120+ pays.

## Dette / décisions à trancher
- Choix définitif du fournisseur IA secondaire (préparé, non câblé).
- Recherche géo : Haversine PostgreSQL en place (MVP). Bascule Elasticsearch geo à prévoir au passage à l'échelle (volumétrie POI / filtres complexes).
- Carte mobile : rendu « radar » data-driven (projection lat/lng) pour le MVP. Intégrer de vraies tuiles (Mapbox GL / react-native-maps + clé) pour la V1 visible.
- Stratégie de sharding/multi-région PostgreSQL à l'échelle DAU 15 M.
- File de messages (jobs IA lourds) : à introduire en Phase 1 (BullMQ sur Redis pressenti).
