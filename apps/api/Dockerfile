# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm install --frozen-lockfile --filter api... \
 && pnpm --filter @attendance/shared build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api build \
 && pnpm --filter api deploy --prod /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out ./
COPY --from=build /repo/apps/api/prisma ./prisma
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
