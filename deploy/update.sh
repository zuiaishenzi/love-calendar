#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=/opt/love-calendar
[[ $EUID -eq 0 ]] || { echo 'Run this updater as root.'; exit 1; }
cd "$base"
exec 9>"$base/update.lock"
flock -n 9 || exit 0
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND='ssh -o BatchMode=yes'
repo=$(cat "$base/repository")
branch=$(cat "$base/branch")
git check-ref-format "refs/heads/$branch" >/dev/null
[[ -f "$base/shared/.env" ]] || { echo 'Missing shared/.env'; exit 1; }
if [[ ! -d "$base/source.git" ]]; then git init --bare "$base/source.git"; fi
git -c http.version=HTTP/1.1 --git-dir="$base/source.git" fetch --depth=1 --no-tags "$repo" "+refs/heads/$branch:refs/heads/deploy"
revision=$(git --git-dir="$base/source.git" rev-parse refs/heads/deploy)
old=$(cat "$base/current" 2>/dev/null || true)
if [[ "$revision" == "$old" ]]; then exit 0; fi
if [[ "${1:-}" != '--retry' && -f "$base/failed" && "$(cat "$base/failed")" == "$revision" ]]; then
  echo "Revision $revision failed previously. Fix GitHub or run update.sh --retry."
  exit 1
fi
release=$(mktemp -d "$base/releases/${revision}.XXXXXX")
git --git-dir="$base/source.git" archive "$revision" | tar -x -C "$release"
new_image="love-calendar:$revision"
compose() { docker compose -p love-calendar -f "$base/compose.yaml" "$@"; }
export CALENDAR_IMAGE="$new_image"
stopped=0
switched=0
backup=''
rollback() {
  code=$?
  trap - ERR INT TERM
  set +e
  printf '%s\n' "$revision" > "$base/failed"
  echo "Update failed for $revision (exit $code)."
  if [[ "$stopped" == 1 ]]; then
    if [[ "$switched" == 1 ]]; then
      if ! compose stop; then echo 'Cannot stop failed container; leaving data untouched. Manual recovery required.'; exit 1; fi
      if [[ -n "$backup" && -f "$backup" ]]; then
        failed_data="$base/shared/failed-data-$(date -u +%Y%m%dT%H%M%S)-$$"
        if ! mv "$base/shared/data" "$failed_data"; then echo 'Cannot preserve failed data. Manual recovery required.'; exit 1; fi
        if ! tar -xzf "$backup" -C "$base/shared"; then echo 'Cannot restore backup. Manual recovery required.'; exit 1; fi
      else echo 'Missing backup; refusing automatic restart.'; exit 1; fi
    fi
    if [[ -n "$old" ]]; then
      export CALENDAR_IMAGE="love-calendar:$old"
      if compose up -d --force-recreate --wait --wait-timeout 120; then echo "Restored $old"; else echo 'Rollback failed; inspect containers and backups.'; fi
    fi
  fi
  exit 1
}
trap rollback ERR INT TERM
# No .env or private data enters these images. Test failures leave the live service untouched.
docker build --target test -t "love-calendar-test:$revision" "$release"
docker build --target production -t "$new_image" "$release"
# Verify the installed production Compose before taking the service down.
compose config --quiet
stopped=1
compose stop
backup="$base/backups/before-${revision}-$(date -u +%Y%m%dT%H%M%S)-$$.tar.gz"
tar -czf "$backup.tmp" -C "$base/shared" data
mv "$backup.tmp" "$backup"
switched=1
compose up -d --force-recreate --wait --wait-timeout 120
printf '%s\n' "$revision" > "$base/current.tmp"
mv "$base/current.tmp" "$base/current"
trap - ERR INT TERM
echo "Deployed $revision; backup: $backup"
