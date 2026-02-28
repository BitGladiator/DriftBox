FROM node:20-alpine AS builder
WORKDIR /app
COPY services/sync/package*.json ./
RUN npm install --only=production

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY shared/ ./shared/
COPY services/sync/ ./
EXPOSE 3004
CMD ["node", "index.js"]