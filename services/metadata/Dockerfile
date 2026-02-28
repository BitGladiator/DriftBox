# ─── Stage 1: Install dependencies ───────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY services/metadata/package*.json ./
RUN npm install --only=production

# ─── Stage 2: Production image ───────────────────────────────
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY shared/ ./shared/
COPY services/metadata/ ./
EXPOSE 3003
CMD ["node", "index.js"]