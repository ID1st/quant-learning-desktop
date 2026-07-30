FROM node:22-bookworm-slim AS builder

WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/cloud-server/package.json apps/cloud-server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace @quant/cloud-server --include-workspace-root=false
COPY apps/cloud-server apps/cloud-server
COPY packages/shared packages/shared
RUN npm run build -w @quant/cloud-server

FROM node:22-bookworm-slim AS production-dependencies

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/cloud-server/package.json apps/cloud-server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspace @quant/cloud-server --include-workspace-root=false \
  && npm cache clean --force

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY apps/cloud-server/package.json apps/cloud-server/package.json
COPY --from=builder /workspace/apps/cloud-server/dist apps/cloud-server/dist

USER node
EXPOSE 8787
CMD ["node", "apps/cloud-server/dist/index.js"]
