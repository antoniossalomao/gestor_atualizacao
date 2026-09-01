FROM node:22-slim

WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm install --omit=dev

COPY server ./server
COPY client ./client

WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
