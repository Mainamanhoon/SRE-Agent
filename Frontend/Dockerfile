FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY Frontend/package.json Frontend/package.json
RUN pnpm install --frozen-lockfile --filter @sre-agent/frontend...
COPY Frontend Frontend
RUN pnpm --filter @sre-agent/frontend build

FROM nginx:1.28-alpine
COPY Frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/Frontend/dist /usr/share/nginx/html
EXPOSE 80
