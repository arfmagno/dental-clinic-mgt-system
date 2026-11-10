# Single-container deployment: the API and the built web app (PWA) are served from one origin.
#   docker build -t dental-clinic .
#   docker run -p 8080:8080 -v clinic-data:/data \
#     -e CLINIC_PASSWORD='choose-a-strong-password' -e AUTH_SECRET="$(openssl rand -hex 32)" dental-clinic

# ---- build the web app ----
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime image ----
FROM node:20-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    WEB_DIR=/app/apps/web/dist \
    TRUST_PROXY=true
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @clinic/server --workspace @clinic/shared
COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY --from=build /app/apps/web/dist apps/web/dist

# The database and its pre-migration backups live on a volume so they survive redeploys.
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/v1/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
