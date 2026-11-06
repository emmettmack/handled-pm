#!/bin/bash
# Render marketing SVGs to PNGs at their exact pixel size, next to each SVG.
# Usage: marketing/render.sh path/to/one.svg [more.svg ...]
set -euo pipefail

CHROME=""
for c in google-chrome chromium chromium-browser \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then CHROME="$c"; break; fi
done
[ -n "$CHROME" ] || { echo "Chrome not found; open the SVG in Figma/Canva instead." >&2; exit 1; }

for svg in "$@"; do
  w=$(grep -oE 'width="[0-9]+"' "$svg" | head -1 | grep -oE '[0-9]+')
  h=$(grep -oE 'height="[0-9]+"' "$svg" | head -1 | grep -oE '[0-9]+')
  [ -n "${w:-}" ] && [ -n "${h:-}" ] || { echo "skip $svg: no width/height attrs" >&2; continue; }
  out="${svg%.svg}.png"
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --window-size="$w,$h" --screenshot="$out" "file://$(cd "$(dirname "$svg")" && pwd)/$(basename "$svg")" >/dev/null 2>&1
  echo "$out"
done
