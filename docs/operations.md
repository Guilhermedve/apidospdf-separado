# Operação da API de PDF

## Inicialização local

1. Substitua `API_KEYS=replace-before-demo` por uma chave longa e aleatória.
2. Confirme que a API de cálculo responde em `http://localhost:3100`.
3. Execute `docker compose up -d --build`.
4. Valide `docker compose ps` e `docker compose logs --tail 100`.
5. Teste `GET http://localhost:3000/health` com `x-api-key`.

A API HTTP fica vinculada somente ao loopback do host. Redis não publica porta.
API e worker compartilham o volume `reports`; os arquivos expiram após 30
minutos.

## Tailscale

Somente depois do health local responder, publique internamente com Tailscale
Serve apontando HTTPS para `http://127.0.0.1:3000`. Não use Funnel. Configure o
`API_URL` do launcher com a URL `https://<host>.<tailnet>.ts.net` e mantenha a
chave no `.env` ao lado do executável.

## Rotas

- `GET /health`
- `POST /reports`
- `GET /reports/:jobId`
- `GET /reports/:jobId/download`

Todas exigem `x-api-key`.
