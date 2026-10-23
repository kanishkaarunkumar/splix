#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

: "${ANDROID_HOME:?Set ANDROID_HOME to an installed Android SDK}"
: "${EXPO_PUBLIC_API_URL:?Set EXPO_PUBLIC_API_URL to the hosted HTTPS API URL}"
if [[ "$EXPO_PUBLIC_API_URL" != https://* ]]; then
  if [[ "${SPLIX_LOCAL_ANDROID_TEST:-}" != 1 || "$EXPO_PUBLIC_API_URL" != http://127.0.0.1:8000 ]]; then
    echo "Use an HTTPS API URL, or explicitly enable the local USB test mode." >&2
    exit 1
  fi
fi
export EXPO_PUBLIC_API_URL

pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile lint
pnpm --dir apps/mobile prebuild --no-install
(
  cd apps/mobile/android
  ./gradlew :app:assembleRelease :splix-capture:testDebugUnitTest \
    --no-daemon --max-workers=2 \
    -PreactNativeArchitectures=arm64-v8a \
    -Pandroid.enableMinifyInReleaseBuilds=false
)
mkdir -p .dist/apk
cp apps/mobile/android/app/build/outputs/apk/release/app-release.apk \
  .dist/apk/splix-test.apk
sha256sum .dist/apk/splix-test.apk
