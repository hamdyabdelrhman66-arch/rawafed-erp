FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run db:generate \
    && npm run build \
    && npm prune --omit=dev

FROM node:22-alpine AS runtime
RUN apk add --no-cache curl postgresql-client tini
ENV NODE_ENV=production PORT=4300
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json
COPY scripts ./scripts
RUN addgroup -S rawafed && adduser -S -G rawafed rawafed && mkdir -p /app/uploads /app/backups && chown -R rawafed:rawafed /app
USER rawafed
EXPOSE 4300
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl --fail http://127.0.0.1:4300/api/live || exit 1
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","dist/server.js"]
