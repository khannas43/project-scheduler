# syntax=docker/dockerfile:1.7
# See docs/TECHNICAL_DESIGN.md §10.2 for the principles this follows:
# multi-stage, non-root, migrations run as a separate init container
# (never on API boot), no toolchain in the runtime image.
#
# Build from the repo root: docker build -f infra/docker/api.Dockerfile .

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---- Prune the monorepo down to what `api` needs to build ----
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm add --global turbo@^2.3.3 && turbo prune api --docker

# ---- Install against the pruned lockfile, then build ----
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# turbo prune only follows package.json dependencies, not tsconfig's
# `extends` — tsconfig.base.json has to be copied in separately.
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo run build --filter=api...
# tsc only compiles .ts — the migration SQL files are read at runtime by
# `db:migrate:prod` (the migrate init container below), so they have to
# travel alongside the compiled output explicitly.
RUN cp -r apps/api/src/db/migrations apps/api/dist/db/migrations
# `pnpm deploy` resolves just api's production dependency graph (including
# the workspace packages it depends on, already built above) into a flat,
# self-contained directory — this is what makes the runtime stage below
# "dist/ + production dependencies only" per §10.2, with no manual
# node_modules surgery.
RUN pnpm --filter=api deploy --prod /repo/out/deploy

# ---- Runtime: deployed output only, non-root ----
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /repo/out/deploy .
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
