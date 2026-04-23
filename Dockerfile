FROM node:22-alpine
WORKDIR /app
# Legacy Express runtime retained until the BRI-29 standalone Next.js
# blue/green deployment handoff migrates Docker and Caddy together.
COPY package*.json ./
RUN npm ci --production
COPY server.js ./
COPY public/ public/
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
EXPOSE 4100
CMD ["node", "server.js"]
