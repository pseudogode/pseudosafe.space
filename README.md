# pseudosafe.space

A fun portal for games — a monorepo with a React portal, an API, and a
real-time Bridge lobby.

## Structure

```
apps/
  client/          React 19 + Vite portal (unstyled). Scratch text + button,
                   and a card linking to the Bridge game.
  server/          Express API for the portal (/api/*).
  bridge-server/   Express + Socket.IO Bridge lobby (rooms, players, chat).
  bridge-client/   React 19 + Vite + Socket.IO Bridge lobby UI (served /bridge/).
nginx/             Reverse proxy config (TLS termination + routing).
scripts/           init-letsencrypt.sh (first-time TLS), startup.sh (deploy).
.github/workflows/ deploy.yml — SSH deploy to a VPS.
```

npm workspaces tie the apps together, but each `package.json` lists its full
dependency set so Docker can build each app in isolation.

## Local development

```bash
npm install                 # installs all workspaces
npm run dev:server          # portal API      -> http://localhost:3001
npm run dev:client          # portal          -> http://localhost:5173
npm run dev:bridge-server   # bridge lobby API -> http://localhost:3002
npm run dev:bridge-client   # bridge lobby UI  -> http://localhost:5174
```

For the bridge client in dev, point it at the local bridge server:

```bash
VITE_SOCKET_URL=http://localhost:3002 VITE_SOCKET_PATH=/socket.io npm run dev:bridge-client
```

## Run the whole stack with Docker

```bash
docker compose build
docker compose up -d
```

Routing through the nginx reverse proxy:

| Path           | Upstream        |
| -------------- | --------------- |
| `/`            | client (static) |
| `/api/`        | server          |
| `/bridge/`     | bridge-client   |
| `/bridge-api/` | bridge-server (Socket.IO) |

## HTTPS with Let's Encrypt

On the VPS, after DNS points at the server, obtain the initial certificate:

```bash
DOMAIN=pseudosafe.space EMAIL=you@example.com ./scripts/init-letsencrypt.sh
```

The `certbot` container renews automatically; nginx reloads every 6h to pick
up renewed certs. Use `STAGING=1` to test against Let's Encrypt staging first.

## Deploying via GitHub Actions

`.github/workflows/deploy.yml` runs on push to `main`. It SSHes into the VPS
using a private key secret and pipes `scripts/startup.sh` to run there — which
pulls latest, rebuilds images, restarts the stack, and bootstraps TLS on first
run.

Configure these under **Settings → Secrets and variables → Actions**.

Only the SSH key is a **secret**:

| Secret                 | Meaning                                   |
| ---------------------- | ----------------------------------------- |
| `VPS_SSH_PRIVATE_KEY`  | Private SSH key authorized on the VPS     |

Everything else is a non-secret **variable** (note: variables are not masked in
workflow logs):

| Variable               | Meaning                                   |
| ---------------------- | ----------------------------------------- |
| `VPS_HOST`             | VPS hostname / IP                         |
| `VPS_USER`             | SSH user                                  |
| `APP_DIR`              | Deploy directory, e.g. `/opt/pseudosafe.space` |
| `REPO_URL`             | Git URL the VPS clones from               |
| `DOMAIN`               | e.g. `pseudosafe.space`                   |
| `LETSENCRYPT_EMAIL`    | Email for cert registration               |

> Note: `bridge-server` uses Socket.IO (which runs over WebSockets, attached to
> the Express HTTP server) so it is wire-compatible with the Socket.IO client.
