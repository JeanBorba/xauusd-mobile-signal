# XAUUSD Mobile Signal

Arquitetura inicial do monitor XAUUSD em tempo real.

## Estrutura

- `mobile/App.js` — terminal React Native
- `server/server.js` — gateway WebSocket e feed XAU/USD
- `server/package.json` — dependências do servidor
- `server/.env.example` — variáveis de ambiente
- `render.yaml` — configuração de deploy

## Fluxo

Twelve Data -> servidor -> WebSocket seguro (WSS) -> app móvel.

A chave do provedor deve ficar somente no servidor, nunca no aplicativo.
