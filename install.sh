#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

BASE=/opt/doto-cloud-bridge
BRANCH=oci-doto-bridge-v31
RAW="https://raw.githubusercontent.com/JeanBorba/xauusd-mobile-signal/${BRANCH}"

if [ "$(id -u)" -ne 0 ]; then
  echo 'Execute como root.' >&2
  exit 1
fi

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl python3 xvfb x11vnc novnc websockify openbox dbus-x11 \
  fonts-liberation xdg-utils snapd

systemctl enable --now snapd.socket || true
if ! snap list chromium >/dev/null 2>&1; then
  snap install chromium
fi

install -d -m 755 "$BASE/extension"
install -d -m 700 /etc/doto-cloud-bridge

for f in extension/manifest.json extension/main.js extension/relay.js extension/background.js run.sh set-token.sh status.sh doto-cloud-bridge.service; do
  curl -fL --retry 5 --retry-delay 2 "${RAW}/${f}" -o "${BASE}/${f}"
done

chmod 755 "$BASE/run.sh" "$BASE/set-token.sh" "$BASE/status.sh"
cp -f "$BASE/doto-cloud-bridge.service" /etc/systemd/system/doto-cloud-bridge.service

install -d -o ubuntu -g ubuntu -m 700 /home/ubuntu/snap/chromium/common
chown -R ubuntu:ubuntu /home/ubuntu/snap

systemctl daemon-reload
systemctl enable --now doto-cloud-bridge.service

cat >/etc/motd.d/99-doto-cloud-bridge <<'EOF'
XAUUSD Doto Cloud Bridge V31
- Configurar chave: sudo /opt/doto-cloud-bridge/set-token.sh
- Status:           sudo /opt/doto-cloud-bridge/status.sh
- Acesso à tela (no seu Windows):
  ssh -L 6080:127.0.0.1:6080 ubuntu@IP_DA_VM
  depois abra http://127.0.0.1:6080/vnc.html
EOF

echo 'DOTO_CLOUD_BRIDGE_INSTALL_OK'
