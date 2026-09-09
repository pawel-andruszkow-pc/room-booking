# --- Build stage ---
FROM node:26-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# --- Production stage ---
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
# Railway provides PORT at runtime; default to 3020 locally.
EXPOSE 3020
# Run any pending migrations on every deploy/boot, then start the server.
# If a migration fails the container exits, so a broken schema never serves traffic.
CMD ["sh", "-c", "pnpm run migration:run:prod && node dist/main.js"]
