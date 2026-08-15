#!/usr/bin/env bash
set -euo pipefail

USER_NAME=ubuntu
USER_HOME=/home/ubuntu
DISPLAY_NUM=:99
BASE=/opt/doto-cloud-bridge
TOKEN_FILE=/etc/doto-cloud-bridge/token
SNAP_COMMON="$USER_HOME/snap/chromium/common"
EXT_RUNTIME="$SNAP_COMMON/doto-cloud-bridge-v31"
PROFILE="$SNAP_COMMON/doto-profile"
DOTO_URL='https://client.doto.com/web-trading/doto?symbol=XAUUSD_OTC'

cleanup() {
  set +e
  for pid in "${CHROME_PID:-}" "${WEB_PID:-}" "${VNC_PID:-}" "${OPENBOX_PID:-}" "${XVFB_PID:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

mkdir -p "$EXT_RUNTIME" "$PROFILE" /run/user/1000
chown -R "$USER_NAME:$USER_NAME" "$USER_HOME/snap/chromium" /run/user/1000
chmod 700 /run/user/1000

cp -f "$BASE/extension/manifest.json" "$EXT_RUNTIME/manifest.json"
cp -f "$BASE/extension/main.js" "$EXT_RUNTIME/main.js"
cp -f "$BASE/extension/relay.js" "$EXT_RUNTIME/relay.js"
cp -f "$BASE/extension/background.js" "$EXT_RUNTIME/background.js"

TOKEN=''
if [ -s "$TOKEN_FILE" ]; then
  TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
fi
python3 - "$EXT_RUNTIME/background.js" "$TOKEN" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); token=sys.argv[2]
s=p.read_text()
s=s.replace("'__BRIDGE_TOKEN__'", json.dumps(token))
p.write_text(s)
PY
chown -R "$USER_NAME:$USER_NAME" "$EXT_RUNTIME" "$PROFILE"
chmod -R go-rwx "$EXT_RUNTIME" "$PROFILE" 2>/dev/null || true

Xvfb "$DISPLAY_NUM" -screen 0 1440x900x24 -ac -nolisten tcp >/var/log/doto-xvfb.log 2>&1 &
XVFB_PID=$!
sleep 2

runuser -u "$USER_NAME" -- env DISPLAY="$DISPLAY_NUM" HOME="$USER_HOME" openbox-session >/var/log/doto-openbox.log 2>&1 &
OPENBOX_PID=$!

x11vnc -display "$DISPLAY_NUM" -localhost -forever -shared -nopw -rfbport 5900 >/var/log/doto-x11vnc.log 2>&1 &
VNC_PID=$!

websockify --web=/usr/share/novnc/ 127.0.0.1:6080 localhost:5900 >/var/log/doto-websockify.log 2>&1 &
WEB_PID=$!

sleep 2

CHROMIUM=/snap/bin/chromium
if [ ! -x "$CHROMIUM" ]; then
  echo "Chromium não encontrado em $CHROMIUM" >&2
  exit 2
fi

runuser -u "$USER_NAME" -- env DISPLAY="$DISPLAY_NUM" HOME="$USER_HOME" XDG_RUNTIME_DIR=/run/user/1000 \
  dbus-run-session -- "$CHROMIUM" \
    --user-data-dir="$PROFILE" \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --disable-features=TranslateUI \
    --disable-background-timer-throttling \
    --disable-renderer-backgrounding \
    --disable-backgrounding-occluded-windows \
    --disable-extensions-except="$EXT_RUNTIME" \
    --load-extension="$EXT_RUNTIME" \
    "$DOTO_URL" >/var/log/doto-chromium.log 2>&1 &
CHROME_PID=$!

wait "$CHROME_PID"
