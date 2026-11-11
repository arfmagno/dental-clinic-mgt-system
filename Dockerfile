# Single-container deployment: the API and the built web app (PWA) are served from one origin.
#   docker build -t dental-clinic .
#   docker run -p 8080:8080 -v clinic-data:/data \
#     -e CLINIC_PASSWORD='choose-a-strong-password' -e AUTH_SECRET="$(openssl rand -hex 32)" dental-clinic

# ---- build the web app ----
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY services/api/package.json services/api/
COPY services/web/package.json services/web/
COPY services/desktop/package.json services/desktop/
# The desktop app is not part of the server image: skip the Electron download.
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
COPY . .
RUN npm run build

# ---- runtime image ----
FROM node:20-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    WEB_DIR=/app/services/web/dist \
    TRUST_PROXY=true
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY services/api/package.json services/api/
COPY services/web/package.json services/web/
COPY services/desktop/package.json services/desktop/
RUN npm ci --omit=dev --workspace @clinic/server --workspace @clinic/shared
COPY shared/src shared/src
COPY services/api/src services/api/src
COPY services/api/scripts/reset-pin.ts services/api/scripts/
COPY --from=build /app/services/web/dist services/web/dist

# The database and its pre-migration backups live on a volume so they survive redeploys.
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/v1/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "services/api/src/index.ts"]
