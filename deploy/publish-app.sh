#!/usr/bin/env bash
set -Eeuo pipefail
base=/opt/love-calendar
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash deploy/publish-app.sh APK build version [notes]'; exit 1; }
[[ $# -ge 3 && -f $1 ]] || { echo 'Usage: publish-app.sh APK build version [notes]'; exit 1; }
revision=$(cat "$base/current")
install -d -m 750 -o 1000 -g 1000 "$base/shared/data/app-updates"
staging=$(mktemp "$base/shared/app-update.XXXXXX")
trap 'rm -f -- "$staging"' EXIT
install -m 644 "$1" "$staging"
docker run --rm --user 1000:1000 --entrypoint node \
  --mount "type=bind,src=$staging,dst=/incoming.apk,readonly" \
  --mount "type=bind,src=$base/shared/data/app-updates,dst=/updates" \
  "love-calendar:$revision" /app/scripts/publish-app.mjs /incoming.apk /updates "$2" "$3" "${4:-客户端修复与体验优化}"
echo 'App update published. Existing APKs are preserved; no app restart is needed.'
