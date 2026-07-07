# Build context is the REPO ROOT (see docker-compose.yml) so the workspace
# package @pseudosafe/shared is available to the TypeScript compiler.

# --- build stage: install workspace deps + compile TS -> dist ---
FROM node:22-alpine AS build
WORKDIR /repo
# Manifests first for layer caching. Only the workspaces this app needs are
# copied; npm's workspace globs only match dirs that exist here.
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/bridge-server/package.json apps/bridge-server/
RUN npm install
# Sources
COPY packages/shared packages/shared
COPY apps/bridge-server apps/bridge-server
RUN npm run build -w apps/bridge-server

# --- runtime: production deps only, run compiled JS ---
FROM node:22-alpine
WORKDIR /repo
COPY package.json ./
# @pseudosafe/shared is a workspace dep, so npm must see its manifest to resolve
# the link locally (even with --omit=dev) — otherwise it hits the registry and
# 404s. It's a type-only package with no runtime code, so package.json is enough.
COPY packages/shared/package.json packages/shared/
COPY apps/bridge-server/package.json apps/bridge-server/
RUN npm install --omit=dev
COPY --from=build /repo/apps/bridge-server/dist apps/bridge-server/dist
WORKDIR /repo/apps/bridge-server
ENV PORT=3002
EXPOSE 3002
CMD ["node", "dist/index.js"]
