# YUMIA — Architecture

## Principe directeur

**Monolithe modulaire**, pas microservices. Un seul déployable backend, mais découpé en modules
à frontières nettes (chaque module = un dossier `src/modules/<x>` avec son contrôleur, son service,
ses DTO). On peut extraire un module en service plus tard sans réécrire la logique métier.

L'IA est **invisible** : aucun écran n'expose le « moteur ». Le client appelle des endpoints métier
(`/suggestions/top3`, `/feed`, `/experiences`) ; l'orchestrateur IA décide en arrière-plan.

## Vue d'ensemble

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│   Mobile (React Native/Expo) │  HTTPS  │      API (NestJS)            │
│   5 onglets · design system  │◄───────►│   monolithe modulaire        │
└──────────────────────────────┘         └──────────────┬───────────────┘
                                                         │
          ┌───────────────────────┬─────────────────────┼───────────────────────┐
          ▼                       ▼                     ▼                       ▼
   ┌────────────┐         ┌────────────┐        ┌────────────┐          ┌──────────────┐
   │ PostgreSQL │         │   Redis    │        │Elasticsearch│         │  IA Provider │
   │  (Prisma)  │         │  cache /   │        │ recherche  │          │  (Anthropic) │
   │ source de  │         │ rate-limit │        │  de lieux  │          │  abstrait    │
   │  vérité    │         │ feed cache │        │ géo + texte│          │ multi-modèle │
   └────────────┘         └────────────┘        └────────────┘          └──────────────┘
```

## Modules backend

| Module          | Responsabilité                                                            |
|-----------------|---------------------------------------------------------------------------|
| `health`        | Liveness/readiness (DB, Redis, Elasticsearch).                            |
| `auth`          | JWT (access/refresh), OAuth Google/Apple, sessions.                       |
| `users`         | Profil, préférences, restrictions alimentaires, abonnement.              |
| `places`        | Lieux (POI), 14 univers, recherche géo via Elasticsearch.                |
| `ai`            | **Cœur** : abstraction provider + orchestrateur des 11 moteurs.          |
| `suggestions`   | Home (Top 3), Surprise Me — s'appuie sur `ai` + `places`.                |
| `feed`          | For You (flux TikTok-like), cache Redis, apprentissage des signaux.      |
| `experiences`   | Experience Builder, Travel/Date/Group/Family modes.                      |
| `gamification`  | XP, niveaux, badges, streaks, défis.                                     |
| `passport`      | Passeport YUMIA : lieux visités, carte du monde, mémoire.                |
| `notifications` | Push intelligentes (Firebase), notifications contextuelles.             |
| `admin`         | Panel admin + CMS interne (modération, contenu, analytics).             |

Frontières : un module **n'importe jamais** le service d'un autre directement s'il s'agit d'une
dépendance « lourde » — on passe par les modules exportés et l'injection NestJS. `ai` ne connaît
pas `places` ; c'est `suggestions` qui orchestre les deux.

## Abstraction IA (multi-modèles)

```
                 ┌─────────────────────────┐
   moteurs IA ──►│   AiService (façade)    │
   (Mood, Food,  │   - run(engine, ctx)    │
    Top3, ...)   └───────────┬─────────────┘
                             ▼
                 ┌─────────────────────────┐
                 │   AiProvider (interface)│   complete() · completeStructured()
                 └───────────┬─────────────┘
              ┌──────────────┴───────────────┐
              ▼                              ▼
     ┌─────────────────┐            ┌─────────────────┐
     │ AnthropicProvider│           │  MockProvider   │  (dev / tests / repli)
     │ @anthropic-ai/sdk│           │  déterministe   │
     └─────────────────┘            └─────────────────┘
```

- **`AiProvider`** : interface minimale (`complete`, `completeStructured`). On ajoute
  `OpenAiProvider`, etc., sans toucher aux moteurs.
- **Modèles tiered** : `claude-sonnet-4-6` (raisonnement : Experience Builder, consensus Group),
  `claude-haiku-4-5` (temps réel : Mood, suggestions Home, objectif < 3 s).
- **Sorties structurées** : `output_config.format` (JSON schema) pour des réponses
  déterministes et parsables (Top 3, scores Family, plan Travel).
- **Pas de `temperature` par défaut** : certains modèles récents la rejettent ; on la laisse
  optionnelle pour rester compatible multi-modèle.
- **Les 11 moteurs** sont enregistrés dans un `EngineRegistry` (clé → prompt + schéma + modèle).
  Voir `packages/shared/src/ai-engines.ts`.

## Cache & performance (objectifs PRD)

- Ouverture < 2 s, réponse IA < 3 s, 60 FPS.
- **Redis** : cache du feed For You par utilisateur, cache des suggestions Home (TTL court),
  rate-limiting, idempotence des appels IA coûteux.
- **Elasticsearch** : requêtes géo « lieux autour de moi » + filtres (humeur, budget, ouvert
  maintenant) à faible latence, là où PostgreSQL reste la source de vérité.
- Les appels IA lents (Experience Builder) sont **asynchrones** quand c'est possible et mis en cache.

## Internationalisation (jour 1)

100+ pays, multi-langues (dont RTL), multi-devises, multi-fuseaux. Les constantes i18n
(locales, devises) vivent dans `@yumia/shared`. La `Culture AI` adapte les suggestions aux
normes locales (halal, végétalien, etc.).

## Sécurité & conformité

JWT courts + refresh rotation, OAuth Google/Apple, RGPD/CCPA/LGPD dès le lancement,
données on-device prioritaires côté mobile, anonymisation des données partagées partenaires.
