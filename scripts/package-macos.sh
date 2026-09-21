#!/usr/bin/env bash
set -euo pipefail

# Run separately on an Intel Mac and an Apple Silicon Mac.
# Usage: bash scripts/package-macos.sh internal|signed [x64|arm64]
mode="${1:-internal}"
arch="${2:-$(node -p 'process.arch')}"
case "$mode" in internal|signed) ;; *) echo "Mode must be internal or signed" >&2; exit 1 ;; esac
case "$arch" in x64|arm64) ;; *) echo "Architecture must be x64 or arm64" >&2; exit 1 ;; esac
test "$(uname -s)" = Darwin || { echo "Run this script on macOS." >&2; exit 1; }
test "$(node -p 'process.arch')" = "$arch" || { echo "Use a native $arch Mac and matching Node.js." >&2; exit 1; }
xcode-select -p >/dev/null
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
node -e 'if(process.versions.node.split(".")[0]!=="24")throw Error("Node.js 24 is required")'
test "$(npm --version | cut -d. -f1)" = 11 || { echo "Install npm 11.12.1 first." >&2; exit 1; }
version="$(node -p 'require("./apps/desktop/package.json").version')"
export QUANT_DESKTOP_RELEASE_DIR="${QUANT_DESKTOP_RELEASE_DIR:-$root/outputs/macos-$version-$arch-$(date +%Y%m%d-%H%M%S)}"
if test -e "$QUANT_DESKTOP_RELEASE_DIR"; then
  echo "Choose a new output directory; existing output will not be overwritten." >&2
  exit 1
fi
if test "$mode" = signed; then
  : "${CSC_LINK:?Export CSC_LINK for your Developer ID Application certificate}"
  : "${CSC_KEY_PASSWORD:?Export CSC_KEY_PASSWORD}"
  : "${APPLE_ID:?Export APPLE_ID}"
  : "${APPLE_APP_SPECIFIC_PASSWORD:?Export APPLE_APP_SPECIFIC_PASSWORD}"
  : "${APPLE_TEAM_ID:?Export APPLE_TEAM_ID}"
fi
npm ci --registry=https://registry.npmjs.org
npm run check
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
if test "$mode" = internal; then
  npm run "package:internal:mac:$arch" -w @quant/desktop
else
  npm run "package:mac:$arch" -w @quant/desktop
fi
artifact="$QUANT_DESKTOP_RELEASE_DIR/quant-learning-desktop-$version-mac-$arch.dmg"
test -f "$artifact"
apps=("$QUANT_DESKTOP_RELEASE_DIR"/mac*/量化学习桌面版.app)
test "${#apps[@]}" -eq 1
application="${apps[0]}"
test -f "$application/Contents/Resources/app.asar.unpacked/node_modules/longbridge-darwin-$arch/longbridge.darwin-$arch.node"
codesign --verify --deep --strict --verbose=2 "$application"
hdiutil verify "$artifact"
if test "$mode" = signed; then
  xcrun stapler validate "$application"
  spctl --assess --type execute --verbose=2 "$application"
fi
shasum -a 256 "$artifact" > "$QUANT_DESKTOP_RELEASE_DIR/SHA256SUMS.txt"
printf 'Artifact: %s\n' "$artifact"
