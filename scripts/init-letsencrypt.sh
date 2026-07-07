#!/usr/bin/env bash
# Obtain the initial Let's Encrypt certificate. Run this ONCE on the VPS after
# DNS for the domain points at the server. Subsequent renewals are automatic
# via the certbot container in docker-compose.yml.
set -euo pipefail

DOMAIN="${DOMAIN:-pseudosafe.space}"
WWW_DOMAIN="www.${DOMAIN}"
EMAIL="${EMAIL:-rjordakiev@asteasolutions.com}"
STAGING="${STAGING:-0}"   # set STAGING=1 to test against Let's Encrypt staging

cd "$(dirname "$0")/.."

CERT_PATH="./certbot/conf/live/${DOMAIN}"
mkdir -p ./certbot/conf ./certbot/www

# 1. Download recommended TLS params if missing.
if [ ! -e "./certbot/conf/options-ssl-nginx.conf" ]; then
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
    > ./certbot/conf/options-ssl-nginx.conf
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem \
    > ./certbot/conf/ssl-dhparams.pem
fi

# 2. Create a dummy self-signed cert so nginx can start with the 443 server block.
echo "### Creating dummy certificate for ${DOMAIN} ..."
mkdir -p "$CERT_PATH"
docker compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '/etc/letsencrypt/live/${DOMAIN}/privkey.pem' \
    -out '/etc/letsencrypt/live/${DOMAIN}/fullchain.pem' \
    -subj '/CN=localhost'" certbot

# 3. Start nginx with the dummy cert.
echo "### Starting nginx ..."
docker compose up --force-recreate -d nginx

# 4. Delete the dummy cert.
echo "### Deleting dummy certificate ..."
docker compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/${DOMAIN} && \
  rm -Rf /etc/letsencrypt/archive/${DOMAIN} && \
  rm -Rf /etc/letsencrypt/renewal/${DOMAIN}.conf" certbot

# 5. Request the real certificate via the webroot challenge.
echo "### Requesting Let's Encrypt certificate for ${DOMAIN} ..."
STAGING_ARG=""
if [ "$STAGING" != "0" ]; then STAGING_ARG="--staging"; fi

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    --email ${EMAIL} \
    -d ${DOMAIN} -d ${WWW_DOMAIN} \
    --rsa-key-size 4096 \
    --agree-tos \
    --non-interactive \
    --force-renewal" certbot

# 6. Reload nginx with the real cert.
echo "### Reloading nginx ..."
docker compose exec nginx nginx -s reload
echo "### Done. HTTPS should now be live for https://${DOMAIN}"
