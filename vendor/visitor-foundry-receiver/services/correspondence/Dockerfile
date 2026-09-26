# syntax=docker/dockerfile:1.7
# Closed-pilot correspondence service. Not the static Hostinger site.
# Compile and run against Node 22 to match package.json engines.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
# Default: do not trust X-Forwarded-* unless the operator sets hop count.
ENV CORRESPONDENCE_TRUST_PROXY=0
ENV CORRESPONDENCE_STORE=postgres
USER node
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json* ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --chown=node:node bin ./bin
COPY --chown=node:node openapi.json ./openapi.json
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
