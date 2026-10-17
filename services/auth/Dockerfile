# ─────────────────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────────────────
# Use Debian-based image (not Alpine) to avoid Prisma binary engine
# compatibility issues with OpenSSL / musl vs glibc.
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Build-time dummy DATABASE_URL so prisma generate succeeds
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Generate Prisma client and compile TypeScript
RUN npx prisma generate
RUN npm run build

# ─────────────────────────────────────────────────────
# Stage 2: Production image
# ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production
# Build-time dummy DATABASE_URL so prisma generate succeeds
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Production deps + Prisma CLI (needed for `prisma migrate deploy`)
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci --omit=dev

# Re-generate Prisma client for the production image's platform
RUN npx prisma generate

# Copy compiled output from the builder stage
COPY --from=builder /app/dist ./dist

# Create mount points and run as non-root user for security
RUN mkdir -p /app/keys && chown -R node:node /app
USER node

EXPOSE 4001

# Run pending migrations then start the service.
# `prisma migrate deploy` is safe to run on every start in production:
# it is idempotent and skips already-applied migrations.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]