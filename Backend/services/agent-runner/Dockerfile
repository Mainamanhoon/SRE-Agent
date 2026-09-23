FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY Backend/services/agent-runner/package.json Backend/services/agent-runner/package.json
RUN pnpm install --frozen-lockfile --filter @sre-agent/agent-runner...

COPY Backend/services/agent-runner Backend/services/agent-runner
RUN pnpm --filter @sre-agent/agent-runner build \
  && pnpm --filter @sre-agent/agent-runner deploy --legacy --prod /out

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV AGENT_WORKSPACE_PATH=/workspace
ENV DEEPSEEK_HOME=/var/lib/agent-runner/dsh

WORKDIR /app
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates git ripgrep \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /workspace/Backend/services/agent-runner/config ./config
RUN mkdir -p /workspace /var/lib/agent-runner/dsh \
  && chown -R node:node /workspace /var/lib/agent-runner

USER node
EXPOSE 4040
CMD ["node", "dist/server.js"]
