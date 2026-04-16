FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY server.js ./
COPY public/ public/
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
EXPOSE 4100
CMD ["node", "server.js"]
