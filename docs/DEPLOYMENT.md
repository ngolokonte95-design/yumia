# 🚀 YUMIA — Runbook de déploiement production

> Le code est **complet pour le lancement**. Ce qui reste est du *câblage externe* :
> secrets, clés API et assets visuels. Ce document mappe chaque placeholder à sa
> source et décrit la séquence de mise en production.

Statut tests au dernier audit : **API 292 unit + 102 e2e + mobile 39 = 433 verts**.

---

## 1. Secrets backend (`.env.prod`)

Copier `.env.prod.example` → `.env.prod` et renseigner. Source de chaque valeur :

| Variable | Où l'obtenir | Bloquant lancement ? |
|---|---|---|
| `POSTGRES_PASSWORD` | généré : `openssl rand -base64 32` | ✅ |
| `REDIS_PASSWORD` | généré : `openssl rand -base64 32` | ✅ |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | générés : `openssl rand -hex 64` (deux valeurs distinctes) | ✅ |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys. Sinon `AI_PROVIDER=mock` (app navigable, réponses simulées) | ⚠️ recommandé |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials → OAuth 2.0 (type **Web**, sert à vérifier l'idToken côté API) | si OAuth Google |
| `SMTP_*` | Resend (resend.com) ou SES. Sans SMTP → OTP/welcome logués en console (reset password KO en prod) | ✅ (reset password) |
| `STORAGE_PROVIDER=s3` + `AWS_*` + `S3_BUCKET` | AWS IAM (user dédié, policy `s3:PutObject` sur le bucket) | ✅ (sinon photos perdues au redémarrage) |
| `STORAGE_PUBLIC_BASE_URL` | URL CloudFront ou S3 public du bucket | ✅ si S3 |
| `ELASTICSEARCH_URL` | endpoint ES managé (Elastic Cloud / OpenSearch). Vide = fallback Postgres Haversine (OK pour lancer) | ❌ optionnel |
| `REVENUECAT_WEBHOOK_SECRET` | RevenueCat Dashboard → Integrations → Webhooks → Authorization header | ✅ **voir §5** |
| `SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_DSN` | sentry.io → Projects → DSN (un projet API, un projet mobile) | ❌ recommandé |
| `ALLOWED_ORIGINS` | domaines front autorisés (CORS) | ✅ |

---

## 2. Config mobile (`apps/mobile/app.json`)

Remplacer les marqueurs `REPLACE_WITH_*` et les chaînes vides dans `extra` :

| Champ | Source |
|---|---|
| `updates.url` + `extra.eas.projectId` | `eas init` (crée le projet, écrit le projectId) |
| `extra.apiBaseUrl` | URL publique de l'API prod (ex. `https://api.yumia.app/api`). En build EAS, préférer `EXPO_PUBLIC_API_BASE_URL` (inliné par Metro, prioritaire) |
| `extra.googleClientId{Web,Ios,Android}` | Google Cloud Console → 3 OAuth clients (Web / iOS bundleId `com.yumia.app` / Android package + SHA-1) |
| `android.config.googleMaps.apiKey` | Google Cloud Console → Maps SDK for Android, clé restreinte au package `com.yumia.app` (react-native-maps n'a PAS de config plugin → la clé va ici, pas dans `plugins`) | 
| `extra.revenueCat{Ios,Android}Key` | RevenueCat Dashboard → Project → API Keys (clés publiques SDK par plateforme) |
| `plugins → @sentry/react-native.organization` | slug org Sentry |

> iOS utilise Apple Maps nativement (pas de clé). La clé Google Maps ne concerne qu'Android.

---

## 3. Assets App Store — ✅ logo officiel en place

Logo officiel YUMIA fourni par le propriétaire (« YUMIA — Vos envies, partout. »),
copié **tel quel** (byte pour byte) dans `apps/mobile/assets/` :

| Fichier | Source | Fond | Alpha |
|---|---|---|---|
| `icon.png` | `logo yumia 3.png` (1254²) | foncé | non — conforme App Store iOS |
| `splash.png` | `logo yumia 3.png` | foncé | non — s'accorde au `#0E0E12` du `app.json` |
| `adaptive-icon.png` | `logo yumia 3 transparent.png` (1024²) | transparent | oui |
| `logo.png` | `logo yumia 3 transparent.png` | transparent | oui |
| `favicon.png` | `logo yumia 3 transparent.png` | transparent | oui |

> ⚠️ **Ne pas régénérer/redessiner le logo** — utiliser les fichiers fournis tels quels.
> Seul point restant éventuel : vérifier que le logo tient dans la **zone sûre centrale
> (~66%)** de l'adaptive Android (sinon léger rognage par le masque) — à valider avec
> le propriétaire avant tout ajustement.

---

## 4. Base de données

```bash
cd apps/api
npx prisma migrate deploy   # applique les migrations existantes (PAS migrate dev en prod)
npm run seed                # optionnel : lieux de démarrage (dist/scripts/seed-places.js)
```

Schéma à jour : `PasswordResetToken`, `User.appleId`, `Visit.notes` déjà présents.

---

## 5. ⚠️ Sécurité — webhook RevenueCat (fail-closed)

Le endpoint `POST /api/webhooks/revenuecat` met à jour le plan utilisateur. Il
**exige** `REVENUECAT_WEBHOOK_SECRET` en production : si la variable est absente,
toute requête est **rejetée** (fail-closed) pour éviter qu'un attaquant s'auto-upgrade
en Plus. Conséquence pratique :

1. Définir le secret dans RevenueCat (Authorization header `Bearer <secret>`).
2. Mettre la **même** valeur dans `REVENUECAT_WEBHOOK_SECRET`.
3. Sans cette config, les abonnements ne se synchroniseront pas (et c'est voulu).

En dev/test (`NODE_ENV != production`), l'absence de secret laisse passer pour le confort local.

---

## 6. Build & release

**API (Docker)**
```bash
docker build -t ghcr.io/yumia/yumia-api:latest -f apps/api/Dockerfile .
docker push ghcr.io/yumia/yumia-api:latest
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

**Mobile (EAS)**
```bash
npm i -g eas-cli && eas login          # ou EXPO_TOKEN en CI
eas init                                # une seule fois → projectId
eas secret:push --scope project --env-file .env.prod   # injecte EXPO_PUBLIC_* + secrets build
eas build --platform all --profile production
eas submit --platform all              # envoi App Store / Play Store
```

OTA (correctifs JS sans resoumission store) : `eas update --branch production`.

---

## 6b. Documents légaux (obligatoire stores)

Modèles RGPD prêts dans `docs/legal/` (à faire relire par un juriste + compléter les `[À COMPLÉTER]`) :
- `docs/legal/POLITIQUE-CONFIDENTIALITE.md` → publier sur **https://yumia.app/privacy**
- `docs/legal/CGU.md` → publier sur **https://yumia.app/terms**

Ces deux URLs sont **déjà référencées dans l'app** (`apps/mobile/app/settings.tsx` → `PRIVACY_URL` / `TERMS_URL`).
Apple et Google **refusent** la soumission sans une URL de politique de confidentialité accessible.

## 7. Checklist pré-lancement

- [ ] Tous les secrets `.env.prod` renseignés (aucun `CHANGE_ME` / `REPLACE_WITH`)
- [ ] `app.json` : zéro `REPLACE_WITH_*`, zéro chaîne vide dans `extra`
- [x] Logo officiel en place (cf. §3) — `icon.png` déjà opaque (fond foncé), conforme iOS
- [ ] Politique de confidentialité + CGU publiées sur yumia.app/privacy et /terms (cf. §6b ; modèles dans `docs/legal/`)
- [ ] `expo-doctor` au vert (17/17) — déjà OK au dernier audit
- [ ] `prisma migrate deploy` exécuté sur la DB prod
- [ ] `REVENUECAT_WEBHOOK_SECRET` identique côté RevenueCat et API (cf. §5)
- [ ] Health OK : `GET /api/health/live` (liveness, toujours 200 si le process tourne) **et** `GET /api/health` (readiness → `status: ok` quand Postgres + Redis + ES répondent ; `degraded` sinon). Brancher livenessProbe sur `/live`, readinessProbe sur `/health`.
- [ ] Sentry reçoit les events (déclencher une erreur test)
- [ ] CORS `ALLOWED_ORIGINS` = domaines réels
- [ ] Tests verts : `cd apps/api && npx jest` + `npx jest --config jest.e2e.config.js` + `cd apps/mobile && npx jest`
- [ ] Typecheck : `npx tsc --noEmit` (api + mobile)
```
