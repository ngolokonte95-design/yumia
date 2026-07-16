# ── Stage 1 : builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copier uniquement les fichiers nécessaires à l'installation des dépendances.
COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Installer toutes les dépendances (y compris devDeps pour la compilation).
RUN npm install --workspace=apps/api --workspace=packages/shared --include-workspace-root

# Copier les sources.
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Compiler le package partagé.
RUN npm run build --workspace=packages/shared

# Générer le client Prisma puis compiler l'API NestJS.
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN NODE_OPTIONS="--max-old-space-size=1024" npm run build --workspace=apps/api

# ── Stage 2 : runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# OpenSSL requis par les binaires du moteur Prisma.
RUN apk add --no-cache openssl

RUN addgroup -S yumia && adduser -S yumia -G yumia

WORKDIR /app

# Dépendances de production uniquement.
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspace=apps/api --workspace=packages/shared --include-workspace-root --omit=dev

# Artefacts compilés depuis le builder.
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Client Prisma + engines pré-construits (évite tout téléchargement au runtime).
# Avec npm workspaces les modules sont hoistés dans /app/node_modules.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
# CLI prisma requis pour "prisma migrate deploy" au démarrage.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY apps/api/prisma ./apps/api/prisma

# Créer dossier uploads + corriger les permissions Prisma avant de passer à yumia.
RUN mkdir -p /app/apps/api/uploads \
  && chown -R yumia:yumia \
       /app/apps/api/uploads \
       /app/node_modules/.prisma \
       /app/node_modules/@prisma/engines \
       /app/node_modules/prisma \
       /app/node_modules/.bin/prisma

USER yumia

WORKDIR /app/apps/api

EXPOSE 4000

# Appliquer les migrations puis démarrer l'application.
CMD ["sh", "-c", "/app/node_modules/.bin/prisma migrate deploy && node dist/main.js"]
