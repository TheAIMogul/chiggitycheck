#!/bin/bash
# usage: scripts/shoot-app.sh name path [desktopHeight] [phoneHeight]
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT=reports/screens; name=$1; path=$2; dh=${3:-1400}; ph=${4:-2400}
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=15000 --run-all-compositor-stages-before-draw --window-size=1440,$dh --screenshot="$OUT/desktop-$name.png" "http://localhost:5173$path" >/dev/null 2>&1
printf '<!doctype html><html><body style="margin:0;background:#fff"><iframe src="http://localhost:5173%s" style="width:375px;height:%spx;border:0;display:block;margin:0 auto"></iframe></body></html>' "$path" "$ph" > "$OUT/frame-$name.html"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=15000 --force-device-scale-factor=2 --window-size=600,$ph --screenshot="$OUT/raw-$name.png" "file://$PWD/$OUT/frame-$name.html" >/dev/null 2>&1
sips -c $((ph*2)) 750 "$OUT/raw-$name.png" --out "$OUT/phone-$name.png" >/dev/null
rm -f "$OUT/raw-$name.png" "$OUT/frame-$name.html"
