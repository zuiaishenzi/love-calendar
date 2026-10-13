#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=/opt/love-calendar
[[ $EUID -eq 0 ]] || { echo 'Run as root'; exit 1; }
[[ -f "$base/app-repository" ]] || { echo 'Private installer repository is not configured; skipped.'; exit 0; }
exec 8>"$base/app-update.lock"
flock -n 8 || exit 0
repo=$(cat "$base/app-repository")
[[ "$repo" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$ || "$repo" =~ ^git@github\.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$ ]] || { echo 'Use a GitHub repository URL without embedded credentials'; exit 1; }
token_file="$base/shared/app-repository-token"
[[ -s "$token_file" ]] || { echo 'Manifest-only sync needs shared/app-repository-token with Contents read permission (SSH keys alone cannot authenticate the GitHub API).'; exit 1; }
[[ $(stat -c %u "$token_file") == 0 && $(stat -c %a "$token_file") =~ ^(400|600)$ ]] || { echo 'Token file must be owned by root with mode 600 or 400'; exit 1; }
branch=main
[[ ! -f "$base/app-branch" ]] || branch=$(cat "$base/app-branch")
git check-ref-format "refs/heads/$branch" >/dev/null
install -d -m 700 -o 1000 -g 1000 "$base/shared/app-download-cache"
install -d -m 750 -o 1000 -g 1000 "$base/shared/data/app-updates"
revision=$(cat "$base/current")
# Token goes through stdin: never argv, environment, logs, or a copied credential file.
docker run --rm -i --user 1000:1000 --entrypoint node \
  --mount "type=bind,src=$base/shared/app-download-cache,dst=/cache" \
  --mount "type=bind,src=$base/shared/data/app-updates,dst=/updates" \
  "love-calendar:$revision" /app/scripts/sync-app-release.mjs "$repo" "$branch" /cache /updates < "$token_file"
echo 'Latest installer manifests synchronized. Historical packages preserved; interrupted transfers can resume.'
