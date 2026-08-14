# SheetSubmit-Shadcnui — monorepo image (frontend + backend).
# build: full install + tsc + vite inside the container (bunx, because bun's
# workspace .bin symlinks don't resolve with `bun run --cwd` in this image).
# deps: clean production-only install for the runtime stage.
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile --linker=hoisted
COPY . .
RUN cd apps/web && bunx tsc -b && bunx vite build

FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --production --frozen-lockfile --linker=hoisted

FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
COPY --from=deps /app/package.json /app/bun.lock /app/
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps /app/apps
USER bun
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "apps/server/src/index.ts"]
