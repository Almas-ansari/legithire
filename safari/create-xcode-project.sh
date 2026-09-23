#!/bin/sh
# Wraps safari/extension/ in a macOS app (Safari extensions ship inside an app),
# builds it, and opens it so Safari picks up the extension.
#
# Needs full Xcode (from the App Store), not just the Command Line Tools.
# Does not need Node or npm: safari/extension/ is already built.
#
#   sh safari/create-xcode-project.sh
set -e
cd "$(dirname "$0")"

if [ ! -f extension/manifest.json ]; then
  echo "safari/extension/ is missing. On the machine with the source, run: npm run build:safari" >&2
  exit 1
fi

# Use Xcode even if xcode-select still points at the Command Line Tools.
if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  XCODE="$(mdfind "kMDItemCFBundleIdentifier == 'com.apple.dt.Xcode'" | head -n 1)"
  [ -z "$XCODE" ] && [ -d /Applications/Xcode.app ] && XCODE=/Applications/Xcode.app
  if [ -z "$XCODE" ]; then
    echo "Xcode not found. Install it from the App Store, open it once, then re-run this script." >&2
    exit 1
  fi
  export DEVELOPER_DIR="$XCODE/Contents/Developer"
fi

APP=LegitHire
BUNDLE_ID="${BUNDLE_ID:-com.legithire.LegitHire}"

xcrun safari-web-extension-converter extension \
  --project-location . \
  --app-name "$APP" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --swift \
  --no-open \
  --no-prompt \
  --force

# The converter references extension/ in place, so re-running build:safari
# and rebuilding in Xcode picks up changes. Build signed "to run locally".
xcodebuild \
  -project "$APP/$APP.xcodeproj" \
  -scheme "$APP" \
  -configuration Release \
  -derivedDataPath build \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="" \
  build | tail -n 3

open "build/Build/Products/Release/$APP.app"

cat <<MSG

Built build/Build/Products/Release/$APP.app and opened it.

Now in Safari:
  1. Settings > Advanced: tick "Show features for web developers".
  2. Settings > Developer: tick "Allow unsigned extensions" (Safari turns this
     off again each time it quits).
  3. Settings > Extensions: tick LegitHire, and allow it on www.linkedin.com.
  4. Open https://www.linkedin.com/feed/
MSG
