# Attendance API image. Built from the prebuilt files in this folder (dist/, prisma/, vendor/);
# no source code or build tools are needed on the server.
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund \
 && npx prisma generate \
 && npm cache clean --force

COPY dist ./dist

ENV NODE_ENV=production \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    CHECKPOINT_DISABLE=1
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply any new database migrations, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
