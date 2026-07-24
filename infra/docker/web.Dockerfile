# syntax=docker/dockerfile:1.7
# See docs/TECHNICAL_DESIGN.md §10.2 (multi-stage, non-root).
#
# NOTE: apps/web is currently a stub (no Vite/React yet — see
# docs/adr/plan.md's "apps/web shell" item). `pnpm --filter web build`
# today just runs tsc and produces no index.html, so this image builds but
# serves an empty directory until that lands. The stage names and layout
# already match the eventual Vite output (`apps/web/dist`), so nothing here
# should need to change once it does.
#
# Build from the repo root: docker build -f infra/docker/web.Dockerfile .

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ---- Prune the monorepo down to what `web` needs to build ----
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm add --global turbo@^2.3.3 && turbo prune web --docker

# ---- Install against the pruned lockfile, then build ----
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# turbo prune only follows package.json dependencies, not tsconfig's
# `extends` — tsconfig.base.json has to be copied in separately.
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo run build --filter=web...

# ---- Runtime: static files served by nginx ----
FROM nginx:1.27-alpine AS runtime
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
