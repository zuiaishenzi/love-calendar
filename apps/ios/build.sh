#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'iOS builds require macOS and Xcode.'; exit 1; }
root=$(cd "$(dirname "$0")/../.." && pwd)
command -v xcodebuild >/dev/null
command -v xcodegen >/dev/null || { echo 'Install XcodeGen: brew install xcodegen'; exit 1; }
command -v node >/dev/null
config="$root/apps/ios/client-build.json"
version=$(node -p "require(process.argv[1]).version" "$config")
build=$(node -p "require(process.argv[1]).build" "$config")
output=$(cd "$root/.." && pwd)/love-app
mkdir -p "$output"
run=$(mktemp -d "$output/ios-build-$build.XXXXXX")
node - "$root" "$run" <<'JS'
const fs=require('fs'),path=require('path'),[root,run]=process.argv.slice(2),config=require(path.join(root,'apps/ios/client-build.json'));
let spec=fs.readFileSync(path.join(root,'apps/ios/project.yml'),'utf8');
spec=spec.replace('path: Sources','path: '+JSON.stringify(path.join(root,'apps/ios/Sources'))).replace('path: Info.plist','path: '+JSON.stringify(path.join(run,'Info.plist')));
spec=spec.replace('MARKETING_VERSION: "1.8.0"','MARKETING_VERSION: '+JSON.stringify(config.version)).replace('CURRENT_PROJECT_VERSION: "10801"','CURRENT_PROJECT_VERSION: '+JSON.stringify(String(config.build)));
fs.writeFileSync(path.join(run,'project.yml'),spec);
JS
xcodegen generate --spec "$run/project.yml" --project "$run"
common=(-project "$run/OurDays.xcodeproj" -scheme OurDays -configuration Release -derivedDataPath "$run/derived" "MARKETING_VERSION=$version" "CURRENT_PROJECT_VERSION=$build")
if [[ "${1:-}" == --simulator ]]; then
  xcodebuild "${common[@]}" -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
  echo "Simulator application: $run/derived/Build/Products/Release-iphonesimulator/OurDays.app"
  exit 0
fi
: "${IOS_TEAM_ID:?Configure IOS_TEAM_ID; do not place signing secrets in the source repository}"
: "${IOS_EXPORT_OPTIONS:?Point IOS_EXPORT_OPTIONS to your private export options plist}"
[[ -f "$IOS_EXPORT_OPTIONS" ]] || { echo 'Export options file is missing'; exit 1; }
xcodebuild "${common[@]}" -destination 'generic/platform=iOS' -archivePath "$run/OurDays.xcarchive" "DEVELOPMENT_TEAM=$IOS_TEAM_ID" -allowProvisioningUpdates archive
codesign --verify --deep --strict "$run/OurDays.xcarchive/Products/Applications/OurDays.app"
xcodebuild -exportArchive -archivePath "$run/OurDays.xcarchive" -exportPath "$run/export" -exportOptionsPlist "$IOS_EXPORT_OPTIONS" -allowProvisioningUpdates
ipa="$run/export/OurDays.ipa"
python3 "$root/scripts/validate-ios-ipa.py" "$ipa" "$build" "$version"
target="$output/OurDays-$version-iOS-build$build.ipa"
python3 - "$ipa" "$target" <<'PY'
import sys, pathlib, shutil, hashlib
source,target=map(pathlib.Path,sys.argv[1:])
if target.exists():
    if hashlib.sha256(source.read_bytes()).digest()!=hashlib.sha256(target.read_bytes()).digest():
        raise SystemExit('Same filename has different contents. Increase the iOS build number.')
else:
    with target.open('xb') as dst, source.open('rb') as src: shutil.copyfileobj(src,dst)
print(target)
PY
