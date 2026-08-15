#!/usr/bin/env bash
set -euo pipefail
echo '=== Serviço ==='
systemctl --no-pager --full status doto-cloud-bridge.service | sed -n '1,12p' || true
echo
echo '=== Porta local noVNC (deve ser 127.0.0.1:6080) ==='
ss -ltnp | grep ':6080' || true
echo
echo '=== Token ==='
if [ -s /etc/doto-cloud-bridge/token ]; then echo 'CONFIGURADO'; else echo 'NÃO CONFIGURADO'; fi
echo
echo '=== Últimas linhas Chromium ==='
tail -n 12 /var/log/doto-chromium.log 2>/dev/null || true
