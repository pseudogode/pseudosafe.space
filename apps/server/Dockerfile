# --- build stage: full deps + compile TS -> dist ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# --- runtime: production deps only, run compiled JS ---
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
