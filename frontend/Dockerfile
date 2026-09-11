# --- Build stage ---
FROM node:26-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# API URL is baked in at build time (Vite env). Override on Railway via build arg.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# Identifies this build for the kiosk auto-reload (see src/stores/UpdateStore).
# Railway passes RAILWAY_GIT_COMMIT_SHA; without it the build timestamp is used.
ARG BUILD_ID
ARG RAILWAY_GIT_COMMIT_SHA
ENV BUILD_ID=$BUILD_ID
ENV RAILWAY_GIT_COMMIT_SHA=$RAILWAY_GIT_COMMIT_SHA
RUN pnpm run build

# --- Serve stage ---
FROM nginx:1.27-alpine
# Listen on the port Railway injects at runtime; default to 8080 locally.
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8080
# Render the nginx config with $PORT (only that var) at boot, then run nginx.
CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
