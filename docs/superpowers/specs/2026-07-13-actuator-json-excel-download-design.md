# Tradução do cache de atuadores para Excel

## Objetivo

Adicionar à API uma biblioteca responsável exclusivamente por traduzir o JSON de atuadores para um arquivo Excel `.xlsx`, de forma semelhante ao papel do Puppeteer no fluxo de PDF. A biblioteca será exposta por um endpoint de download síncrono.

O arquivo representará uma única fazenda por vez. O nome da fazenda aparecerá somente no nome do arquivo, nunca nas colunas ou em abas de resumo.

## Fonte dos dados

A biblioteca consumirá o cache somente leitura já exposto pela API de cálculo:

```http
GET /actuators/farms/:farm
```

Exemplos de origem:

```http
GET /actuators/farms/central-af
GET /actuators/farms/flamengo-af
```

O fluxo de exportação não chamará o endpoint de recálculo:

```http
POST /actuators/farms/:farm/run
```

Recalcular o cache continuará sendo uma ação explícita e externa à biblioteca de Excel.

## Contrato observado do JSON

O documento possui:

- `farm`: nome da fazenda;
- `slug`: slug usado nas rotas;
- `generatedAt`: instante de geração do cache;
- `windowStart` e `windowEnd`: janela consultada;
- `filter`: filtro aplicado pela origem;
- `summary`: totais do cache;
- `tables`: objeto cujas chaves são nomes de tabelas/atuadores e cujos valores são arrays de registros.

Cada registro dentro de `tables` possui:

- `TIME`: data e hora do evento;
- `ADDR`: endereço numérico;
- `NOTE`: anotação que identificou o evento de atuador.

O exemplo validado de `central-af` tinha 121 tabelas com correspondência e 37.619 registros em aproximadamente 3,7 MB de JSON.

## Biblioteca escolhida

A implementação usará `exceljs`.

Motivos:

- geração real de `.xlsx`;
- suporte a escrita incremental com `WorkbookWriter`;
- controle de estilos, largura de colunas, autofiltro e congelamento do cabeçalho;
- leitura do arquivo gerado nos testes para validar o artefato final.

A biblioteca interna não conhecerá HTTP ou NestJS. Ela receberá um documento validado e um destino gravável e produzirá o workbook.

## Arquitetura

### `ActuatorCacheClient`

Responsável por:

- montar `GET {DATAPOOL_BASE_URL}/actuators/farms/:farm`;
- reutilizar timeout e autenticação Basic já configurados para o datapool;
- verificar o status HTTP;
- decodificar o JSON;
- validar o contrato antes de iniciar o download.

### `ActuatorCacheSchema`

Schema Zod estrito para validar metadados, resumo, mapa de tabelas e registros `TIME`, `ADDR` e `NOTE`.

As chaves de `tables` permanecerão dinâmicas porque representam os nomes reais dos atuadores.

### `ActuatorWorkbookService`

Tradutor independente de JSON para Excel. Responsável por:

- transformar o mapa `tables` em linhas;
- ordenar atuadores pelo nome;
- ordenar os registros de cada atuador por `TIME`;
- converter `TIME` para célula de data do Excel;
- gravar cabeçalho e linhas incrementalmente;
- finalizar o workbook sem manter todas as células em memória.

### `ActuatorExcelController`

Responsável somente pelo contrato HTTP:

- validar o slug da fazenda;
- solicitar o documento ao cliente;
- configurar os headers de download;
- entregar o stream gerado pelo tradutor.

### `ActuatorExcelModule`

Agrupará cliente, schema, tradutor e controller e será importado no `AppModule`.

## Endpoint público

```http
GET /actuators/farms/:farm/excel
```

Exemplo:

```http
GET /actuators/farms/central-af/excel
```

Resposta de sucesso:

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="central-af-atuadores.xlsx"
```

O parâmetro `:farm` aceitará somente um slug seguro no formato já adotado pelo projeto: letras minúsculas, números e hífens.

## Formato do arquivo

Nome:

```text
<slug>-atuadores.xlsx
```

O workbook terá uma única aba chamada `Atuadores` e nenhuma aba de resumo.

Colunas, nesta ordem:

| Coluna | Origem | Formato |
| --- | --- | --- |
| `ÁREA` | chave em `tables` | texto |
| `DATA/HORA` | `TIME` | `dd/mm/yyyy hh:mm:ss` |
| `ADDR` | `ADDR` | inteiro |
| `FIR` | número extraído de `NOTE` | inteiro |
| `PRODUTO` | produto extraído de `NOTE` | texto |
| `INJETADO (L)` | volume injetado extraído de `NOTE` | número |
| `PROGRAMADO (L)` | volume programado extraído de `NOTE` | número |
| `NOTA` | `NOTE` sem o invólucro técnico `$...$` | texto |

Notas de injeção no formato `$'FIR233-AGUA' injetou 45 de 45 litros$` preencherão todas as colunas derivadas. Notas de falha no formato `$Falha na fertirrigação. (FIR:233)$` serão mantidas: `FIR` será preenchido e `PRODUTO`, `INJETADO (L)` e `PROGRAMADO (L)` ficarão vazios. Nenhum registro será descartado porque a nota não corresponde ao formato de injeção.

Não serão incluídos `farm`, `slug`, período, filtro, totais ou outros metadados no conteúdo da planilha.

## Usabilidade da planilha

- primeira linha em negrito, centralizada, com texto branco e fundo azul escuro;
- cabeçalho congelado;
- autofiltro em todas as oito colunas;
- bordas finas e larguras adequadas às oito colunas;
- linhas ordenadas por `ÁREA` e depois por `DATA/HORA`;
- `ADDR` mantido como número para permitir filtro e ordenação numérica;
- volumes mantidos como números para permitir filtros e cálculos;
- `NOTA` gravada explicitamente como texto, sem interpretar conteúdo como fórmula.

## Volume e limites

A aba do Excel aceita no máximo 1.048.576 linhas, incluindo o cabeçalho. A primeira versão manterá exatamente uma aba, como aprovado.

Se o documento tiver mais de 1.048.575 registros, o endpoint retornará erro de volume excedido em vez de truncar dados ou criar abas adicionais silenciosamente.

O JSON será carregado e validado antes de iniciar a resposta. As linhas do workbook serão gravadas incrementalmente para limitar o consumo adicional de memória.

## Erros

- slug inválido: `400 Bad Request`;
- fazenda/cache inexistente na origem: `404 Not Found`;
- API de cálculo indisponível: `503 Service Unavailable`;
- timeout da origem: `504 Gateway Timeout`;
- JSON fora do contrato: `502 Bad Gateway`;
- quantidade acima do limite de uma aba: `422 Unprocessable Entity`;
- erro na geração do XLSX: `500 Internal Server Error`.

Nenhum erro deve produzir um arquivo marcado como download válido. A validação completa ocorrerá antes da definição dos headers de sucesso. Se uma falha de escrita ocorrer depois do início do stream, a conexão será encerrada e o erro será registrado.

## Segurança

- o endpoint aceitará somente slugs validados;
- a URL remota será construída a partir de `DATAPOOL_BASE_URL`, nunca de uma URL fornecida pelo usuário;
- autenticação do datapool não será exposta na resposta ou nos logs;
- nomes de arquivo serão derivados exclusivamente do slug validado;
- valores de `NOTE` serão tratados como texto, evitando fórmulas injetadas no Excel;
- o endpoint será somente leitura e não disparará `POST /run`.

## Estrutura prevista

```text
src/actuator-excel/
  actuator-cache.client.ts
  actuator-cache.schema.ts
  actuator-excel.controller.ts
  actuator-excel.errors.ts
  actuator-excel.module.ts
  actuator-excel.types.ts
  actuator-workbook.service.ts
```

Também serão alterados:

- `package.json` e lockfile para adicionar `exceljs`;
- `src/app.module.ts` para importar `ActuatorExcelModule`;
- configuração apenas se um timeout específico for necessário; por padrão será reutilizado `DATAPOOL_TIMEOUT_MS`.

## Testes

### Schema

- aceita documento válido com múltiplas tabelas;
- rejeita `TIME` inválido;
- rejeita `ADDR` não inteiro;
- rejeita registro sem `NOTE`;
- preserva nomes dinâmicos de atuadores.

### Cliente

- monta a URL correta com slug escapado;
- envia Basic Auth quando configurado;
- respeita timeout;
- converte respostas `404`, indisponibilidade e contrato inválido para erros internos previsíveis.

### Tradutor

- gera somente a aba `Atuadores`;
- gera exatamente as oito colunas aprovadas;
- não inclui fazenda ou metadados;
- ordena por área e data;
- mantém `ADDR` numérico e `TIME` como data;
- interpreta notas de injeção e de falha sem excluir registros;
- preserva a nota legível como texto;
- configura autofiltro e cabeçalho congelado;
- rejeita volume acima do limite sem truncar.

### Endpoint

- retorna content type de XLSX;
- retorna `Content-Disposition` com `<slug>-atuadores.xlsx`;
- transmite um workbook que o próprio ExcelJS consegue abrir novamente;
- não chama endpoint de recálculo;
- propaga os códigos públicos definidos para cada erro.

### Verificação real

Um teste de integração usará um fixture pequeno, gerará o `.xlsx`, reabrirá o arquivo com ExcelJS e verificará nome da aba, cabeçalhos, tipos e quantidade de linhas. Um teste manual final consumirá `central-af`, gerará o arquivo completo e confirmará que as 37.619 linhas estão presentes.

## Critérios de aceitação

- `GET /actuators/farms/central-af/excel` baixa `central-af-atuadores.xlsx`;
- o arquivo contém somente a aba `Atuadores`;
- a aba contém somente `ÁREA`, `DATA/HORA`, `ADDR`, `FIR`, `PRODUTO`, `INJETADO (L)`, `PROGRAMADO (L)` e `NOTA`;
- todos os registros do JSON aparecem exatamente uma vez;
- registros de falha permanecem na planilha com FIR e nota, mesmo sem produto ou volumes;
- o nome da fazenda aparece somente no nome do arquivo;
- o endpoint nunca recalcula o cache;
- arquivos grandes são gravados incrementalmente e nunca truncados silenciosamente;
- build, testes unitários e teste de integração passam.
