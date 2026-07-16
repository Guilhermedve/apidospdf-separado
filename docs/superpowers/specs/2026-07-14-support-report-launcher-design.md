# Executável de relatórios para suporte via Tailscale

## Objetivo

Adaptar o `Relatorios.exe` existente para consumir exclusivamente a nova API de
PDF pela rede privada Tailscale. O executável deve permitir escolher uma fazenda
e um período, solicitar o relatório, acompanhar o processamento, baixar um PDF
validado e facilitar sua abertura pelo operador de suporte.

## Usuários e fronteira de acesso

O executável é uma ferramenta interna da equipe de suporte. Todos os
computadores que o utilizam devem estar autenticados na mesma tailnet da API de
PDF. A API não será publicada para clientes ou para a internet aberta nesta
fase.

O executável acessa somente a API de PDF. Ele não recebe endereço ou credencial
da API de cálculo e nunca acessa Redis, banco de dados, cache em disco, Docker,
cron ou rotas administrativas.

## Arquitetura

```text
Relatorios.exe
    |
    | HTTPS na tailnet + x-api-key
    v
API de PDF
    |
    | GET interno e somente leitura
    v
API de cálculo -> cache log.json atualizado pelo cron
```

O cron permanece responsabilidade exclusiva da API de cálculo. O executável
sempre trabalha sob demanda e não dispara recálculo.

## Configuração externa

Ao lado de `Relatorios.exe` existirão:

- `.env`, contendo `API_URL`, `API_KEY`, `OUTPUT_DIR`, `POLL_INTERVAL_MS` e
  `POLL_TIMEOUT_MS`;
- nenhuma credencial deve ser compilada dentro do `.exe`;
- `farms.json` deixa de ser a fonte principal e pode ser removido da distribuição
  após o endpoint de descoberta estar disponível.

`API_URL` deve ser uma URL HTTPS do nome Tailscale da API de PDF. A aplicação
remove barras finais antes de construir rotas. `API_KEY` é enviado somente no
header `x-api-key`.

## Contrato acessado pelo executável

### Verificação de saúde

```http
GET /health
x-api-key: <chave>
```

Resposta `200`:

```json
{ "status": "ok" }
```

Esse endpoint confirma acesso à API de PDF. Ele não deve consultar o datapool
nem criar relatório.

### Descoberta de fazendas

```http
GET /farms
x-api-key: <chave>
```

Resposta `200`:

```json
{
  "farms": [
    {
      "slug": "macacos-af",
      "name": "Macacos - AF",
      "periods": ["3h", "3d", "7d"]
    }
  ]
}
```

A API de PDF obtém essa descoberta pela rota pública de leitura da API de
cálculo, normaliza e devolve somente os campos acima. O executável não recebe a
URL do serviço de cálculo.

### Criação de relatório

```http
POST /reports
x-api-key: <chave>
content-type: application/json

{
  "farmSlug": "macacos-af",
  "period": "3h"
}
```

Resposta `202`:

```json
{
  "jobId": "01JZREPORT123",
  "status": "queued",
  "statusUrl": "/reports/01JZREPORT123",
  "expiresInMinutes": 30
}
```

O executável usa o período simbólico `3h`, `3d` ou `7d`. Ele não envia mais
`hours`, `days` ou `farms[]`.

### Acompanhamento

```http
GET /reports/:jobId
x-api-key: <chave>
```

Estados suportados:

- `queued`: aguardando processamento;
- `processing`: HTML/PDF em geração;
- `done`: arquivo disponível e `downloadUrl` presente;
- `failed`: `errorCode` e mensagem pública presentes.

O polling usa intervalo configurável, respeita timeout total e para
imediatamente em `done` ou `failed`. O executável valida `jobId` e aceita a URL
de download somente quando ela é relativa e começa com `/reports/`.

### Download

```http
GET /reports/:jobId/download
x-api-key: <chave>
```

O executável exige resposta `200`, `Content-Type: application/pdf`, tamanho não
trivial e assinatura `%PDF-`. O corpo é salvo inicialmente como `.tmp` e só é
renomeado para `.pdf` depois da validação completa.

## Experiência do operador

1. Ao iniciar, carregar e validar a configuração.
2. Testar a conexão com a API de PDF.
3. Buscar a lista de fazendas e períodos disponíveis.
4. Mostrar pesquisa por nome e slug.
5. Mostrar somente períodos disponíveis para a fazenda selecionada.
6. Confirmar fazenda e período antes da criação.
7. Exibir progresso textual enquanto consulta o job.
8. Baixar para `OUTPUT_DIR/<farmSlug>/<data>-<periodo>.pdf` sem sobrescrever um
   arquivo diferente; quando o nome existir, acrescentar o `jobId`.
9. Informar o caminho final e oferecer abrir o PDF ou sua pasta.
10. Manter o console aberto quando iniciado por duplo clique.

## Tratamento de falhas

- Tailscale indisponível, DNS ou conexão recusada: informar que a rede privada
  deve estar conectada.
- `401` ou `403`: informar chave inválida ou sem autorização, sem imprimir a
  chave.
- `404` na fazenda/período: atualizar a lista e pedir nova seleção.
- Dados desatualizados: explicar que o cache da fazenda ainda não foi renovado.
- `429`: respeitar `Retry-After` quando presente.
- `5xx` ou erro transitório no status: repetir com limite; não repetir criação
  automaticamente para evitar jobs duplicados.
- Timeout: mostrar o `jobId`, permitindo que o operador consulte novamente.
- PDF inválido ou interrompido: apagar somente o `.tmp`; preservar PDFs válidos
  existentes.
- Cancelamento com `Ctrl+C`: interromper polling/download e limpar temporários.

As mensagens exibidas devem vir de códigos públicos da API, não de stack traces
ou detalhes internos.

## Segurança

- A API de PDF deve estar restrita à tailnet e usar HTTPS.
- Toda rota usada pelo executável exige `x-api-key`.
- A chave não aparece em logs, nomes de arquivo ou mensagens de erro.
- O executável não desabilita validação TLS.
- Slug, `jobId`, período e nomes locais são validados antes de compor caminhos.
- URLs absolutas devolvidas pela API não são seguidas; downloads permanecem no
  mesmo `API_URL` configurado.
- O diretório de saída é resolvido e cada arquivo deve permanecer dentro dele.

## Compatibilidade e migração

O projeto atual já possui separação entre API, polling, download, configuração,
menu e caminhos. A migração deve preservar esses limites e trocar o contrato da
API antiga pelo novo.

Durante a transição, `farms.json` pode existir como fallback somente se a
descoberta remota falhar e o operador aceitar continuar com uma lista
potencialmente desatualizada. Depois que `GET /farms` estiver estável, esse
fallback e sua cópia em `dist-exe` devem ser removidos juntos.

## Testes e verificação

- Testes unitários dos contratos, headers, timeouts e mensagens por status HTTP.
- Testes do polling para `queued -> processing -> done`, `failed`, timeout,
  `Retry-After` e cancelamento.
- Testes do download para MIME, assinatura, escrita temporária, rename atômico e
  proteção de caminho.
- Testes do menu com fazendas e períodos retornados pela API.
- Teste de integração contra uma API simulada, sem depender de Tailscale.
- `npm.cmd run build`, `npm.cmd run bundle` e `npm.cmd run package`.
- Execução do `Relatorios.exe` empacotado em Windows com `.env` externo.
- Prova real via Tailscale: criar, acompanhar, baixar e validar um relatório de
  `macacos-af` para `3h`.

## Critérios de aceite

- O executável usa somente a API de PDF pela tailnet.
- A lista de fazendas vem da API de PDF e os períodos respeitam disponibilidade.
- O contrato enviado é `{ farmSlug, period }`.
- Status e download usam as novas rotas.
- PDFs incompletos nunca aparecem como concluídos.
- Segredos não são compilados nem exibidos.
- O `.exe` empacotado conclui o fluxo real de Macacos sem acesso direto à API de
  cálculo.
