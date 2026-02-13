FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/*/package.json ./packages/
COPY packages/@voltclaw/*/package.json ./packages/@voltclaw/*/

RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY packages/ ./packages/

RUN pnpm build

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "packages/@voltclaw/cli/dist/index.js", "start"]

EXPOSE 8080
