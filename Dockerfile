FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS compatibility
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.8.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/testing/package.json packages/testing/package.json
COPY packages/observability/package.json packages/observability/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
RUN pnpm exec playwright install --with-deps chromium
COPY apps ./apps
COPY packages ./packages
COPY prisma ./prisma
COPY prisma.config.ts tsconfig*.json angular.json ./
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm build
COPY scripts ./scripts
COPY tests ./tests
COPY vitest.config.ts eslint.config.mjs ./
ENV NODE_ENV=production HOST=0.0.0.0
CMD ["node", "apps/api/dist/main.js"]
