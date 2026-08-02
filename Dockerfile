# Multi-stage build: build the React client, then run the Node server which
# serves the built client + API + sockets from a single container/port.
# This exists so a non-technical buyer has a path to a real hosted URL
# (Render/Railway/Fly/any Docker host) without installing Node locally.

FROM node:20-slim AS client-build
WORKDIR /app
COPY shared/ ./shared/
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-slim AS server
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev
COPY server/ ./server/
COPY configs/ ./configs/
COPY shared/ ./shared/
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server/src/index.js"]
