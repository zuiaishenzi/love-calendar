#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash deploy/install.sh'; exit 1; }
for cmd in docker git systemctl flock tar; do command -v "$cmd" >/dev/null || { echo "Missing: $cmd"; exit 1; }; done
docker compose version >/dev/null
docker info >/dev/null
base=/opt/love-calendar
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$base" "$base/bin" "$base/shared" "$base/releases" "$base/backups"
exec 9>"$base/update.lock"
flock -n 9 || { echo 'An update is running; retry later.'; exit 1; }
if [[ ! -d "$base/shared/data" ]]; then
  install -d -m 700 -o 1000 -g 1000 "$base/shared/data"
fi
if [[ ! -f "$base/shared/.env" ]]; then
  install -m 600 "$source_dir/../.env.example" "$base/shared/.env"
fi
if [[ ! -f "$base/repository" ]]; then
  printf '%s\n' 'https://github.com/zuiaishenzi/love-calendar.git' > "$base/repository"
  printf '%s\n' 'main' > "$base/branch"
fi
install -m 700 "$source_dir/update.sh" "$base/bin/update.sh"
install -m 600 "$source_dir/compose.yaml" "$base/compose.yaml"
install -m 644 "$source_dir/love-calendar-update.service" /etc/systemd/system/
install -m 644 "$source_dir/love-calendar-update.timer" /etc/systemd/system/
systemctl daemon-reload
echo "Installed. Edit $base/shared/.env first."
echo "First deploy: sudo bash $base/bin/update.sh"
echo 'Enable auto update AFTER first deployment succeeds: sudo systemctl enable --now love-calendar-update.timer'
