#!/usr/bin/env bash
set -euo pipefail
TOKEN_FILE=/etc/doto-cloud-bridge/token
install -d -m 700 /etc/doto-cloud-bridge
printf 'Cole a chave privada do Bridge (não é senha da Doto): ' >&2
IFS= read -r TOKEN
TOKEN="$(printf '%s' "$TOKEN" | tr -d '\r\n')"
if [ "${#TOKEN}" -lt 20 ]; then
  echo 'Chave inválida/curta.' >&2
  exit 1
fi
umask 077
printf '%s' "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
systemctl restart doto-cloud-bridge.service
echo 'Chave instalada e serviço reiniciado.'
