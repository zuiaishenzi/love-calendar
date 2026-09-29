#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=/opt/love-calendar
mode=${1:---check}
[[ "$mode" == --check || "$mode" == --apply ]] || { echo 'Use --check or --apply'; exit 1; }
[[ $EUID -eq 0 ]] || { echo 'Run as root'; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
script="$script_dir/../scripts/shorten-ledger-codes.mjs"
[[ -f "$script" && -f "$base/shared/data/calendar.sqlite" ]] || { echo 'Script or database missing'; exit 1; }
exec 9>"$base/update.lock"
flock -n 9 || { echo 'An update or conversion is running; retry later.'; exit 1; }
container=$(docker ps -q --filter label=com.docker.compose.project=love-calendar --filter label=com.docker.compose.service=calendar)
[[ -n "$container" && "$container" != *$'\n'* ]] || { echo 'Expected one running calendar container'; exit 1; }
image=$(docker inspect --format '{{.Image}}' "$container")
if [[ "$mode" == --apply ]]; then
 docker stop "$container"
 trap 'docker start "$container" >/dev/null' EXIT
fi
docker run --rm --network none --user "$(stat -c '%u:%g' "$base/shared/data/calendar.sqlite")" \
 -v "$base/shared/data:/app/data" -v "$script:/app/shorten-ledger-codes.mjs:ro" \
 --entrypoint node "$image" /app/shorten-ledger-codes.mjs "$mode" /app/data/calendar.sqlite
