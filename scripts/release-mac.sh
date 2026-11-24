#!/usr/bin/env bash
# RU: Сборка AegisROM для macOS (`npm run release:mac`). Запускается только на Mac
#     (в CI — runner macos-latest): нужны Xcode Command Line Tools, Go, Node.
#     Собирает фронтенд, бинарники arm64 и amd64 (cgo), склеивает их в universal
#     через lipo, кладёт в AegisROM.app, подписывает ad-hoc (без аккаунта Apple)
#     и упаковывает в public/downloads/AegisROM-v<версия>-macOS-universal.dmg.
# EN: Builds AegisROM for macOS (`npm run release:mac`). Runs on a Mac only
#     (macos-latest runner in CI): needs Xcode Command Line Tools, Go, Node.
#     Builds the frontend, arm64 and amd64 binaries (cgo), merges them into a
#     universal binary with lipo, wraps it in AegisROM.app, signs it ad-hoc (no
#     Apple account) and packs public/downloads/AegisROM-v<version>-macOS-universal.dmg.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "release-mac.sh: run on macOS / запускать на macOS" >&2
  exit 1
fi

BASE_VERSION="$(node -p "require('./package.json').version")"
VERSION="${AEGIS_BUILD_VERSION:-$BASE_VERSION}"
FILE_VERSION="${VERSION//+/.}"
# CFBundleShortVersionString: только цифры и точки / digits and dots only.
SHORT_VERSION="$(printf '%s' "$BASE_VERSION" | sed -E 's/^([0-9]+(\.[0-9]+){0,2}).*/\1/')"
MIN_MACOS="11.0"

OUT_DIR="$ROOT/public/downloads"
WORK="$ROOT/build/macos"
APP="$WORK/AegisROM.app"
DMG_NAME="AegisROM-v${FILE_VERSION}-macOS-universal.dmg"
WEBDIST="$ROOT/cmd/aegis-mac/webdist"

echo "=== AegisROM v${VERSION} (macOS universal) ==="
rm -rf "$WORK"
mkdir -p "$WORK" "$OUT_DIR"

# 1. Frontend (+ EmulatorJS for Quick test)
node scripts/fetch-emulatorjs.mjs
VITE_APP_VERSION="$VERSION" npx vite build
[ -f dist/index.html ] || { echo "vite build: no dist/index.html" >&2; exit 1; }

# 2. dist -> cmd/aegis-mac/webdist, without release binaries
rm -rf "$WEBDIST"
mkdir -p "$WEBDIST"
cp -R dist/. "$WEBDIST/"
rm -f "$WEBDIST"/downloads/*.exe "$WEBDIST"/downloads/*.zip "$WEBDIST"/downloads/*.gz "$WEBDIST"/downloads/*.dmg
touch "$WEBDIST/.gitkeep"

# 3. Go binaries: arm64 + amd64 with cgo, then lipo
LDFLAGS="-s -w -X main.appVersion=${VERSION}"
for pair in "SS_DEV_ID:ssBuiltinDevID" "SS_DEV_PASSWORD:ssBuiltinDevPassword"; do
  env_name="${pair%%:*}"; go_name="${pair##*:}"; val="${!env_name:-}"
  if [ -n "$val" ]; then
    if ! [[ "$val" =~ ^[A-Za-z0-9_.@+-]+$ ]]; then echo "$env_name: unsupported characters" >&2; exit 1; fi
    LDFLAGS="$LDFLAGS -X aegisgui/aegisapi.${go_name}=${val}"
  fi
done
export CGO_ENABLED=1 MACOSX_DEPLOYMENT_TARGET="$MIN_MACOS"
export CGO_CFLAGS="-mmacosx-version-min=$MIN_MACOS" CGO_LDFLAGS="-mmacosx-version-min=$MIN_MACOS"
for arch in arm64 amd64; do
  echo "> go build darwin/$arch"
  GOOS=darwin GOARCH="$arch" go build -trimpath -ldflags="$LDFLAGS" -o "$WORK/AegisROM-$arch" ./cmd/aegis-mac
done
lipo -create -output "$WORK/AegisROM" "$WORK/AegisROM-arm64" "$WORK/AegisROM-amd64"
lipo -info "$WORK/AegisROM"

# 4. AegisROM.app
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$WORK/AegisROM" "$APP/Contents/MacOS/AegisROM"
ICONSET="$WORK/AegisROM.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" public/aegisrom-icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z "$d" "$d" public/aegisrom-icon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AegisROM.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>AegisROM</string>
  <key>CFBundleDisplayName</key><string>AegisROM</string>
  <key>CFBundleIdentifier</key><string>io.github.wirgylle.aegisrom</string>
  <key>CFBundleExecutable</key><string>AegisROM</string>
  <key>CFBundleIconFile</key><string>AegisROM</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${SHORT_VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>${MIN_MACOS}</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>AegisROM</string>
</dict>
</plist>
PLIST
plutil -lint "$APP/Contents/Info.plist"

# 5. Ad-hoc signature (no Apple Developer account; Gatekeeper workaround in README)
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

# 6. .dmg with a link to /Applications
STAGE="$WORK/dmg"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$OUT_DIR"/AegisROM-v*-macOS-universal.dmg
hdiutil create -volname "AegisROM" -srcfolder "$STAGE" -ov -format UDZO "$OUT_DIR/$DMG_NAME"
hdiutil verify "$OUT_DIR/$DMG_NAME"
ls -lh "$OUT_DIR/$DMG_NAME"
echo "Done: public/downloads/$DMG_NAME"
