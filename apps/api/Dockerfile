# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @ccip/api --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @ccip/database run db:generate
RUN pnpm --filter @ccip/api run build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
RUN addgroup -S ccip && adduser -S ccip -G ccip
COPY --from=installer /app .
COPY apps/api/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
USER ccip
EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
