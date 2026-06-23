#!/usr/bin/env bash
# Usage: ./scripts/deploy.sh [tag]
# Exemple: ./scripts/deploy.sh sha-abc1234
# Sans argument : utilise "latest"
set -euo pipefail

TAG="${1:-latest}"
REGISTRY="ghcr.io"
IMAGE_BASE="${REGISTRY}/yumia/yumia-api"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"

echo "==> Déploiement YUMIA API — image : ${IMAGE_BASE}:${TAG}"

# Vérifications préalables
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERREUR : ${ENV_FILE} introuvable. Copie .env.prod.example et renseigne les variables."
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo "ERREUR : docker non disponible."
  exit 1
fi

# Authentification GHCR (nécessite GHCR_TOKEN dans l'environnement ou le trousseau Docker)
if [[ -n "${GHCR_TOKEN:-}" ]]; then
  echo "${GHCR_TOKEN}" | docker login "${REGISTRY}" -u "${GHCR_USER:-yumia}" --password-stdin
fi

# Pull de la nouvelle image
docker pull "${IMAGE_BASE}:${TAG}"

# Mettre à jour la variable API_IMAGE dans le fichier .env.prod
sed -i "s|^API_IMAGE=.*|API_IMAGE=${IMAGE_BASE}:${TAG}|" "${ENV_FILE}"

# Appliquer — zero-downtime grâce à depends_on + healthcheck
docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --remove-orphans

# Attendre que l'API soit healthy
echo "==> Attente du healthcheck API..."
RETRIES=30
until docker compose -f "${COMPOSE_FILE}" exec -T api \
  wget -qO- http://localhost:4000/api/health 2>/dev/null | grep -q '"status":"ok"'; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    echo "ERREUR : l'API n'est pas healthy après 30 tentatives."
    docker compose -f "${COMPOSE_FILE}" logs api --tail 50
    exit 1
  fi
  echo "  ... attente ($RETRIES restants)"
  sleep 2
done

echo "==> Déploiement réussi — ${IMAGE_BASE}:${TAG}"
