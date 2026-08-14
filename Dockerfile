# SheetSubmit-Shadcnui — monorepo build of the old single-stage Dockerfile.
# Stage 1 builds the web app (full deps + tsc + vite), stage 2 ships production
# deps + the built dist + the TS server (compiled by bun at runtime).
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN cd apps/web && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build
RUN bun install --production

FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
COPY --from=build /app/package.json /app/bun.lock /app/
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps /app/apps
USER bun
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "apps/server/src/index.ts"]
