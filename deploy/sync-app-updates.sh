#!/usr/bin/env bash
set -Eeuo pipefail
base=/opt/love-calendar
[[ $EUID -eq 0 ]] || { echo 'Run as root'; exit 1; }
[[ -f "$base/app-repository" ]] || { echo 'Private APK repository is not configured; skipped.'; exit 0; }
exec 8>"$base/app-update.lock"
flock -n 8 || exit 0
repo=$(cat "$base/app-repository")
[[ "$repo" =~ ^git@github\.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$ ]] || { echo 'Use a GitHub SSH private repository URL'; exit 1; }
branch=main
[[ ! -f "$base/app-branch" ]] || branch=$(cat "$base/app-branch")
git check-ref-format "refs/heads/$branch" >/dev/null
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND='ssh -o BatchMode=yes'
if [[ -f "$base/shared/app-repository-key" ]]; then export GIT_SSH_COMMAND='ssh -i /opt/love-calendar/shared/app-repository-key -o IdentitiesOnly=yes -o BatchMode=yes'; fi
[[ -d "$base/app-source.git" ]] || git init --bare "$base/app-source.git"
git --git-dir="$base/app-source.git" fetch --depth=1 --no-tags "$repo" "+refs/heads/$branch:refs/heads/app"
release=$(mktemp -d "$base/releases/app.XXXXXX")
git --git-dir="$base/app-source.git" archive refs/heads/app | tar -x -C "$release"
chmod 755 "$release"
find "$release" -type f -exec chmod 644 {} +
install -d -m 750 -o 1000 -g 1000 "$base/shared/data/app-updates"
revision=$(cat "$base/current")
docker run --rm --user 1000:1000 --entrypoint node \
  --mount "type=bind,src=$release,dst=/incoming,readonly" \
  --mount "type=bind,src=$base/shared/data/app-updates,dst=/updates" \
  "love-calendar:$revision" /app/scripts/import-app-release.mjs /incoming /updates
echo 'Private APK repository synchronized. Existing packages preserved.'
