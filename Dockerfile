FROM node:24-alpine AS base
ARG ALPINE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/alpine
WORKDIR /app
COPY package.json package-lock.json ./
# Keep the base image's Alpine release and architecture; only change the mirror.
# Retain HTTPS verification and apk package signature checks.
RUN sed -i "s#https\?://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#g" /etc/apk/repositories \
 && apk add --no-cache --virtual .build-deps python3 make g++
RUN npm ci --omit=dev --include=optional && apk del .build-deps
COPY server.mjs db.mjs encrypted-db.mjs accounts.mjs mail.mjs calendar.mjs reminders.mjs realtime.mjs ./
COPY public ./public
COPY scripts ./scripts
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.mjs"]

FROM base AS test
COPY test.mjs test-v13.mjs test-encryption.mjs ./
RUN npm test

FROM base AS production
