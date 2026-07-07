# Build context is the REPO ROOT (see docker-compose.yml) so the workspace
# package @pseudosafe/shared is available to the TypeScript compiler. The
# shared imports are type-only, so Vite/esbuild erase them from the bundle.

# --- build stage: install workspace deps + tsc type-check + vite build ---
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/bridge-client/package.json apps/bridge-client/
RUN npm install
COPY packages/shared packages/shared
COPY apps/bridge-client apps/bridge-client
RUN npm run build -w apps/bridge-client

# --- runtime: static files served by nginx under /bridge/ ---
FROM nginx:1.27-alpine
COPY --from=build /repo/apps/bridge-client/dist /usr/share/nginx/html/bridge
COPY apps/bridge-client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
