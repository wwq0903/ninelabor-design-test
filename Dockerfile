# Deploy both the Express /api endpoints and the built Vite SPA in one service.
# This is NOT a static-only Netlify deployment.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
# bun.lock is retained from the original source; npm install resolves dependencies.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
# Server imports shared source and the Firebase project config at repository root.
# Both must be present or the container fails at module resolution before listening.
COPY --from=build /app/src ./src
COPY --from=build /app/firebase-applet-config.json ./firebase-applet-config.json
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "server.ts"]
