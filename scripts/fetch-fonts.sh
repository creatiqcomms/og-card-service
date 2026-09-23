#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Creatiq Millennium Holdings Trust
#
# Download OFL font binaries required by src/card.js.
# Does not vendor fonts into git — run after clone.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/assets/fonts"
mkdir -p "$DIR"
cd "$DIR"

echo "Fetching Oswald Bold…"
curl -fsSL -o Oswald-Bold.ttf \
  'https://github.com/googlefonts/OswaldFont/raw/main/fonts/ttf/Oswald-Bold.ttf'

echo "Fetching DM Sans…"
curl -fsSL -o DMSans-Regular.ttf \
  'https://github.com/googlefonts/dm-fonts/raw/main/Sans/fonts/ttf/DMSans-Regular.ttf'
curl -fsSL -o DMSans-SemiBold.ttf \
  'https://github.com/googlefonts/dm-fonts/raw/main/Sans/fonts/ttf/DMSans-SemiBold.ttf'
curl -fsSL -o DMSans-Bold.ttf \
  'https://github.com/googlefonts/dm-fonts/raw/main/Sans/fonts/ttf/DMSans-Bold.ttf'

ls -la "$DIR"/*.ttf
echo "Done. Remember OFL obligations if you redistribute these files."
