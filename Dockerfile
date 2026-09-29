FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --include=optional
COPY server.mjs db.mjs accounts.mjs mail.mjs calendar.mjs reminders.mjs ./
COPY public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.mjs"]

FROM base AS test
COPY test.mjs test-v13.mjs ./
RUN npm test

FROM base AS production
