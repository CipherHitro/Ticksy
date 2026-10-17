# ─────────────────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─────────────────────────────────────────────────────
# Stage 2: Production image
# ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 8080

CMD ["node", "dist/index.js"]
