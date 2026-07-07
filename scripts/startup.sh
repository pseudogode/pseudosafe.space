#!/usr/bin/env bash
# Deploy/startup script run on the VPS by the GitHub Actions workflow over SSH.
# It pulls the latest code, rebuilds images, and (re)starts the stack. On the
# very first run it also bootstraps the Let's Encrypt certificate.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/pseudosafe.space}"
REPO_URL="${REPO_URL:-git@github.com:OWNER/pseudosafe.space.git}"
BRANCH="${BRANCH:-main}"

# 1. Clone on first deploy, otherwise fetch latest.
if [ ! -d "$APP_DIR/.git" ]; then
  echo "### Cloning repo into $APP_DIR ..."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
echo "### Updating source ..."
git fetch --all
git reset --hard "origin/$BRANCH"

# 2. Build and start the stack.
echo "### Building and starting containers ..."
docker compose build
docker compose up -d

# 3. Bootstrap TLS certificate the first time (no cert on disk yet).
if [ ! -d "$APP_DIR/certbot/conf/live" ]; then
  echo "### No certificate found — running init-letsencrypt.sh ..."
  chmod +x scripts/init-letsencrypt.sh
  ./scripts/init-letsencrypt.sh
fi

echo "### Deploy complete."
docker compose ps
