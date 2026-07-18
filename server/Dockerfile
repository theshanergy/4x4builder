FROM node:22-alpine

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node server/ ./
COPY --chown=node:node network/ /app/network/

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:8080/health').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "index.js"]
