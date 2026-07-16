# Especificação da API de geração de PDF de bateria

Data: 2026-07-10

## 1. Objetivo e escopo

Criar do zero uma API NestJS dedicada exclusivamente à geração de relatórios PDF de bateria. A API consumirá por HTTP o JSON pronto da API de cálculo e reutilizará do sistema antigo somente as regras de adaptação, os cálculos visuais, o HTML, o CSS, os gráficos e o modelo do PDF.

A geração será assíncrona com BullMQ e Redis. Cada solicitação produzirá um PDF novo, sem cache ou deduplicação. O arquivo poderá ser baixado repetidamente por 30 minutos e será removido automaticamente depois desse prazo.

Incluído:

- NestJS, TypeScript, BullMQ, Redis e Puppeteer;
- consumo da datapool para os períodos `3h`, `3d` e `7d`;
- relatório completo ou seleção de dispositivos;
- validação integral do JSON recebido;
- HTML autocontido e PDF A4 paisagem;
- armazenamento local temporário com escrita atômica;
- health checks, logs, rate limit, timeouts e concorrência controlada;
- testes unitários, de integração, contrato e fluxo completo;
- Docker para API, worker e Redis.

Fora do escopo:

- sensores e atuadores;
- SSH, MySQL ou acesso ao volume da Raspberry Pi;
- solicitação de novos cálculos pela API de PDF;
- geração síncrona;
- cache ou histórico permanente de PDFs;
- S3, MinIO e períodos diferentes de `3h`, `3d` e `7d`.

## 2. Arquitetura e fluxo

```text
Usuário
  -> POST /reports
  -> ReportsController valida a solicitação
  -> ReportsService cria um job no BullMQ
  -> Redis mantém estado e progresso
  -> ReportProcessor recebe o job
  -> DatapoolClient baixa o JSON
  -> DatapoolSchema valida contrato e idade
  -> BatteryReportMapper seleciona e normaliza dispositivos
  -> ReportViewModelBuilder aplica as regras visuais antigas
  -> ReportHtmlRenderer cria HTML autocontido
  -> PdfService gera o PDF com Puppeteer
  -> StorageService grava .tmp.pdf e renomeia para .pdf
  -> job fica ready por 30 minutos
  -> usuário consulta o status e baixa o arquivo
  -> CleanupService remove arquivos expirados
```

A API de cálculo continua responsável por bancos, dispositivos, diagnósticos e caches de dados. A API de PDF somente lê a datapool, valida, transforma e renderiza. Ela nunca acessa SSH ou MySQL e nunca chama endpoints que iniciam cálculos.

## 3. Contrato HTTP da API de PDF

### 3.1 Criar relatório

```http
POST /reports
Content-Type: application/json
```

```json
{
  "farmSlug": "entre-rios",
  "period": "3d",
  "deviceAddrs": ["045", "038"]
}
```

Regras:

- `farmSlug` é obrigatório e corresponde ao slug fornecido pela datapool;
- `period` aceita somente `3h`, `3d` ou `7d`;
- `deviceAddrs` é opcional; ausente significa todos os dispositivos;
- ADDRs são strings normalizadas com três dígitos;
- lista vazia, duplicatas, valores inválidos e campos desconhecidos são rejeitados;
- cada chamada válida cria um job novo.

Resposta:

```json
{
  "jobId": "01JZREPORT123",
  "status": "queued",
  "statusUrl": "/reports/01JZREPORT123",
  "expiresInMinutes": 30
}
```

### 3.2 Estado e progresso

```http
GET /reports/:jobId
```

Estados:

```text
queued
fetching-data
processing-data
rendering-html
generating-pdf
ready
failed
expired
```

Quando pronto, o status inclui `downloadUrl`, `generatedAt` e `expiresAt`. Quando falhar, inclui código operacional e mensagem segura, sem stack trace, URL interna ou JSON bruto.

### 3.3 Download

```http
GET /reports/:jobId/download
```

O endpoint funciona somente para jobs `ready` não expirados, responde com `application/pdf` e `Content-Disposition: attachment`, permite repetição durante 30 minutos e nunca aceita um caminho de arquivo do cliente.

### 3.4 Saúde

```http
GET /health
```

Verifica API, Redis, diretório temporário e ambiente do Puppeteer. O estado remoto da datapool é apresentado separadamente para uma indisponibilidade externa não derrubar o health básico da API.

## 4. Contrato recebido da datapool

A API chamará:

```http
GET /diagnostics/farms/{farmSlug}/periods/{period}
```

O documento deve conter `farm`, `period`, `generatedAt`, `windowStart`, `windowEnd`, `devices` e `summary`. Cada dispositivo, indexado por ADDR, deve conter `addr`, `table`, `model`, `modelType`, `classification`, `primaryFunctionLabel`, `status`, `errorMessage`, `stats`, `health`, `legacy` e `raw`.

A validação verifica:

- tipos e campos obrigatórios;
- correspondência do período solicitado;
- coerência entre chave do mapa e `addr`;
- datas válidas e ordem da janela;
- idade máxima configurável do cache remoto;
- presença dos dispositivos selecionados;
- estrutura de dados brutos, estatísticas, saúde e legado.

Contrato inválido encerra o job. A API não adivinha campos e não gera PDF parcial ou vazio silenciosamente.

## 5. Módulos e responsabilidades

- `ConfigModule`: valida URL da datapool, timeout, idade máxima, Redis, diretório, retenção de 30 minutos, concorrência e limites.
- `ReportsModule`: DTOs e casos de uso de criação, status e download.
- `QueueModule`: BullMQ, payload estrito, progresso, tentativas e retenção de metadados; não armazena o JSON completo no Redis.
- `DatapoolModule`: HTTP persistente, compressão, timeout e tradução de erros.
- `BatteryDataModule`: schema externo, tipos validados, normalização e seleção.
- `ReportTemplateModule`: view model, indicadores, agrupamentos, textos, séries, HTML, CSS e JavaScript autocontidos.
- `PdfModule`: ciclo de vida do browser, página por job e impressão A4 paisagem com fundos.
- `StorageModule`: nomes seguros, escrita atômica, download, expiração e limpeza.
- `HealthModule`: saúde da API e dependências operacionais.

O código antigo será referência, não dependência de runtime. Nenhum módulo antigo de banco, SSH ou descoberta de fazendas será portado.

## 6. Arquivos temporários e expiração

O `jobId` validado define `<jobId>.tmp.pdf` e `<jobId>.pdf`. Puppeteer escreve primeiro no temporário; somente após sucesso ocorre rename atômico. O prazo de 30 minutos começa quando o job entra em `ready`.

A limpeza periódica remove:

- PDFs com `expiresAt` vencido;
- temporários abandonados por processos interrompidos;
- metadados antigos conforme a política do BullMQ.

Downloads não renovam a expiração.

## 7. Erros e tentativas

Podem ser repetidos: timeout, desconexão e HTTP `429`, `502`, `503` ou `504` da datapool. A política inicial é a tentativa original e no máximo duas repetições com backoff.

Não são repetidos: DTO inválido, período inválido, fazenda ou dispositivo inexistente, HTTP `400` ou `404`, schema inválido, dados antigos e erro determinístico de transformação.

Códigos públicos previstos:

- `INVALID_REQUEST`;
- `FARM_NOT_FOUND`;
- `DEVICE_NOT_FOUND`;
- `DATAPOOL_UNAVAILABLE`;
- `DATAPOOL_CONTRACT_INVALID`;
- `DATAPOOL_DATA_STALE`;
- `PDF_GENERATION_FAILED`;
- `REPORT_NOT_READY`;
- `REPORT_EXPIRED`.

## 8. Segurança e operação

- validação global estrita e rejeição de campos desconhecidos;
- allowlist de períodos, ADDRs e formatos de identificador;
- `jobId` nunca usado como caminho arbitrário;
- rate limit separado para criação, status e download;
- limite de jobs ativos e concorrência do worker;
- escape de todo texto dinâmico no HTML;
- template sem recursos web externos;
- logs estruturados sem registros brutos de bateria;
- mensagens públicas separadas das causas internas;
- timeout HTTP e do Puppeteer;
- encerramento gracioso de API, worker, páginas e browser;
- limpeza de temporários após falha.

A implantação Docker terá `pdf-api`, `pdf-worker` e `redis`. API e worker usam a mesma imagem, processos separados e um volume compartilhado somente para PDFs temporários. Redis não armazena PDFs.

## 9. Estratégia de testes

Testes unitários cobrem DTOs, ADDRs, schema, datas, seleção de dispositivos, erros, view model, nomes de arquivo, expiração e estados.

Testes de integração cobrem cliente HTTP simulado, Redis/BullMQ, processamento do `log.json` como fixture, escrita e rename, download, expiração com relógio controlado e repetição de falhas transitórias.

O fluxo completo cobre os três períodos, job até `ready`, PDF não vazio, download repetido, expiração, relatório completo e filtrado, falhas claras e comparação visual com o modelo antigo.

## 10. Roadmap

1. Fundação NestJS, configuração validada e Docker.
2. Contratos TypeScript da datapool e fixture derivada do `log.json`.
3. Cliente HTTP com timeout, compressão e erros tipados.
4. DTOs e endpoints de criação e consulta.
5. BullMQ, Redis, payload, progresso e estados.
6. Normalização e seleção dos dispositivos.
7. Portabilidade das regras e cálculos visuais antigos.
8. Portabilidade do HTML, CSS, gráficos e layout.
9. Puppeteer e escrita atômica.
10. Download seguro e retenção de 30 minutos.
11. Limpeza de expirados e temporários abandonados.
12. Health checks, logs, rate limit e concorrência.
13. Testes unitários, integração e ponta a ponta.
14. Teste contra a datapool real e homologação visual.
15. Documentação de operação e implantação.

## 11. Critérios de aceite

- API criada do zero em NestJS e TypeScript;
- somente relatórios de bateria;
- nenhum acesso a SSH ou MySQL;
- nenhuma geração de PDF dispara cálculo na Raspberry Pi;
- períodos `3h`, `3d` e `7d`;
- relatório completo ou por dispositivos;
- cada pedido gera um PDF novo;
- nenhum cache ou deduplicação de PDF;
- downloads repetíveis por 30 minutos;
- remoção automática de PDFs e temporários;
- JSON inválido, antigo ou ausente nunca produz PDF vazio;
- repetição limitada somente para falhas transitórias;
- layout homologado contra o relatório antigo;
- testes cobrem contrato, fila, geração, download e expiração.

