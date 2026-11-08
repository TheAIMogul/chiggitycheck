#!/bin/bash
# usage: shoot.sh name query desktopHeight phoneHeight
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
name=$1; q=$2; dh=${3:-1300}; ph=${4:-2400}
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=5000 --window-size=1440,$dh --screenshot="desktop-$name.png" "file://$PWD/mockup.html?$q" >/dev/null 2>&1
printf '<!doctype html><html><body style="margin:0;background:#fff"><iframe src="mockup.html?%s" style="width:375px;height:%spx;border:0;display:block;margin:0 auto"></iframe></body></html>' "$q" "$ph" > "frame-$name.html"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=5000 --force-device-scale-factor=2 --window-size=600,$ph --screenshot="raw-$name.png" "file://$PWD/frame-$name.html" >/dev/null 2>&1
sips -c $((ph*2)) 750 "raw-$name.png" --out "phone-$name.png" >/dev/null
rm -f "raw-$name.png" "frame-$name.html"
