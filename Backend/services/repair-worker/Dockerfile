FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY Backend/services/repair-worker/package.json Backend/services/repair-worker/package.json
RUN pnpm install --frozen-lockfile --filter @sre-agent/repair-worker...

COPY Backend/services/repair-worker Backend/services/repair-worker
RUN pnpm --filter @sre-agent/repair-worker build && pnpm --filter @sre-agent/repair-worker deploy --legacy --prod /out

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
CMD ["node", "dist/worker.js"]
