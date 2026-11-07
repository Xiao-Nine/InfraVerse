# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server

RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=4s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]