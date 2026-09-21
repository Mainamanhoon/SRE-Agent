FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY Backend/services/control-api/package.json Backend/services/control-api/package.json
RUN pnpm install --frozen-lockfile --filter @sre-agent/control-api...

COPY Backend/services/control-api Backend/services/control-api
RUN pnpm --filter @sre-agent/control-api build && pnpm --filter @sre-agent/control-api deploy --legacy --prod /out

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
