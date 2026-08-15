# XAUUSD Doto Cloud Bridge V31

Objetivo: manter o **XAUUSD_OTC/XAUUSD real da Doto** alimentando o Render 24/7 sem deixar o PC doméstico ligado.

## Por que Oracle Cloud Always Free

A configuração usa **VM.Standard.A1.Flex com 2 OCPUs e 12 GB**, dentro do limite Always Free publicado pela Oracle. A VM abre somente a porta SSH (22). O navegador remoto/noVNC fica em `127.0.0.1:6080` e só é acessado por túnel SSH.

## Implantar

Use o botão oficial do Oracle Resource Manager:

[![Deploy to Oracle Cloud](https://oci-resourcemanager-plugin.plugins.oci.oraclecloud.com/latest/deploy-to-oracle-cloud.svg)](https://cloud.oracle.com/resourcemanager/stacks/create?zipUrl=https://github.com/JeanBorba/xauusd-mobile-signal/archive/refs/heads/cloud-doto-bridge-v31.zip)

Na criação da stack:
1. Selecione tenancy/compartment.
2. Cole **somente a chave pública SSH**.
3. Mantenha `Run apply` habilitado.
4. Crie a stack.

## Depois da VM pronta

1. Copie `public_ip`.
2. Conecte por SSH.
3. Configure a chave privada do Bridge:
   `sudo /opt/doto-cloud-bridge/set-token.sh`
4. No Windows, abra um túnel:
   `ssh -L 6080:127.0.0.1:6080 ubuntu@IP_DA_VM`
5. Enquanto o túnel estiver aberto, visite:
   `http://127.0.0.1:6080/vnc.html`
6. Faça login na Doto **diretamente dentro do navegador da VM**.
7. Confirme o selo:
   `DOTO→CLOUD→APP ● XAUUSD_OTC · ticks N`

Depois disso você pode fechar o navegador local e o túnel SSH. A VM continua rodando. Se a Doto encerrar a sessão futuramente, reabra o túnel e faça login de novo.

## Segurança

- Senha/JWT/cookies Doto permanecem somente no perfil Chromium da VM.
- O Bridge envia somente ticks/candles ao endpoint Render.
- A chave de ingestão do Bridge fica em `/etc/doto-cloud-bridge/token` com permissão `600`.
- noVNC não fica exposto à internet.
- Não coloque credenciais Doto em Terraform, GitHub ou Render.

## Diagnóstico

`sudo /opt/doto-cloud-bridge/status.sh`

`sudo journalctl -u doto-cloud-bridge -n 100 --no-pager`

`sudo tail -n 100 /var/log/doto-cloud-bootstrap.log`
