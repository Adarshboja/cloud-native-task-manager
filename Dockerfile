FROM node:22-alpine AS production-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:22-alpine AS runtime-base

ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
USER node

FROM runtime-base AS test-runner

ENV NODE_ENV=test
COPY --chown=node:node tests ./tests
CMD ["npm", "test"]

FROM runtime-base AS runtime

ENV PORT=5000
EXPOSE 5000
STOPSIGNAL SIGTERM
CMD ["node", "src/server.js"]
