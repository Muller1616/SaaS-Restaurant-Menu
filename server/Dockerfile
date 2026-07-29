# Production API image (Render / Docker hosts).
# Build from repo root: docker build -f server/Dockerfile .

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
# Skip lifecycle scripts: server postinstall runs `prisma generate`, but the
# Prisma schema is not copied until the build stage below.
RUN npm ci --workspace=server --include-workspace-root --ignore-scripts

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY package.json package-lock.json ./
COPY server ./server
# npm ci used --ignore-scripts. Install the correct linux Sharp binary so
# payment/menu/logo optimization works on Render.
RUN npm rebuild sharp --workspace=server --foreground-scripts \
  || (cd /app && npm install --no-save --foreground-scripts sharp@0.35.3)
WORKDIR /app/server
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/node_modules ./server/node_modules
WORKDIR /app/server
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
