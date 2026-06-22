FROM node:20-alpine AS client-build
WORKDIR /app

COPY package.json ./
COPY client/package.json ./client/
RUN npm install --ignore-scripts && cd client && npm install

COPY client ./client
RUN cd client && npm run build

FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/app/data

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY server ./server
COPY --from=client-build /app/client/dist ./client/dist

RUN mkdir -p /app/data/backups && chown -R node:node /app

USER node
EXPOSE 8080

CMD ["node", "server/index.js"]
