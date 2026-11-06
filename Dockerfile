FROM node:24-alpine3.23 AS base
ARG ALPINE_MIRROR=https://mirrors.ustc.edu.cn/alpine
WORKDIR /app
COPY package.json package-lock.json ./
# Keep the base image's Alpine release and architecture; only change the mirror.
# Retain HTTPS verification and apk package signature checks.
RUN set -eu; \
    cp /etc/apk/repositories /tmp/apk-repositories; \
    installed=0; \
    for mirror in "$ALPINE_MIRROR" https://mirrors.aliyun.com/alpine https://dl-cdn.alpinelinux.org/alpine; do \
      sed "s#https\?://dl-cdn.alpinelinux.org/alpine#${mirror}#g" /tmp/apk-repositories > /etc/apk/repositories; \
      echo "Installing build dependencies from $mirror"; \
      if apk --timeout 15 add --no-cache --virtual .build-deps python3 make g++; then installed=1; break; fi; \
      echo 'Alpine repository failed; trying the next HTTPS repository.' >&2; \
    done; \
    rm /tmp/apk-repositories; \
    if [ "$installed" != 1 ]; then echo 'All Alpine repositories failed. Check server HTTPS/DNS connectivity.' >&2; exit 1; fi
RUN npm ci --omit=dev --include=optional && apk del .build-deps
COPY server.mjs db.mjs encrypted-db.mjs accounts.mjs lifecycle.mjs memoir-export.mjs mail.mjs calendar.mjs reminders.mjs realtime.mjs memos.mjs chat.mjs media.mjs speech.mjs app-updates.mjs notifications.mjs agreements.mjs agreement-lines.mjs holidays.mjs ./
COPY stickers.mjs sticker-images.mjs sticker-search.mjs ./
COPY public ./public
COPY scripts ./scripts
COPY deploy/update.sh deploy/sync-app-updates.sh ./scripts/
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.mjs"]

FROM base AS test
COPY test.mjs test-v13.mjs test-encryption.mjs test-settings.mjs test-memos.mjs test-chat.mjs test-speech.mjs test-app-sync.mjs test-android-calendar.mjs test-agreements.mjs test-holidays.mjs ./
COPY test-stickers.mjs ./
COPY apps/android/app/src/main/assets/calendar-layout.js ./apps/android/app/src/main/assets/
RUN npm run test:server

FROM base AS production
