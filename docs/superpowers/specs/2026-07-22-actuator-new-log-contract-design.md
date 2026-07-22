# Novo contrato de logs de atuadores na API de PDFs

## Objetivo

Atualizar a exportação Excel de atuadores para consumir exclusivamente o novo
snapshot produzido pela API de cálculo. O contrato antigo, com `tables` no topo
e linhas contendo `ADDR`, não será mais aceito.

## Contrato de entrada

A API de PDFs continuará consultando:

```text
GET {DATAPOOL_BASE_URL}/actuators/farms/:farm
```

O documento deve conter:

- metadados `farm`, `slug`, `generatedAt`, `windowStart` e `windowEnd`;
- `summary.tables` e `summary.rows`, além dos aliases temporários
  `totalTables`, `tablesWithMatches` e `totalRows` ainda publicados pelo
  produtor;
- `sectors`, um mapa indexado pelo nome do setor;
- `sectors[setor].tables`, um mapa indexado pelo nome da tabela do atuador;
- linhas com `TIME`, `FLOW`, `VOL` e `NOTE`;
- `errors` opcional, com entradas contendo `table` e `message`, quando alguma
  tabela falhar sem invalidar o restante do snapshot.

`TIME` deve ser um timestamp ISO válido. `FLOW` e `VOL` devem ser números.
`NOTE` pode ser texto ou `null`. O schema será estrito: propriedades inesperadas
no documento, setor, linha ou entrada de erro serão rejeitadas.

## Fluxo

1. `ActuatorCacheClient` busca o snapshot da fazenda na API de cálculo.
2. O schema Zod valida o novo documento e rejeita o contrato antigo.
3. `ActuatorWorkbookService` percorre setores, tabelas e linhas.
4. A resposta XLSX é transmitida pela rota existente:
   `GET /actuators/farms/:farm/excel`.

O conteúdo será ordenado por nome do setor, nome do atuador e `TIME`.

## Planilha

A exportação continuará usando uma única aba chamada `Atuadores`, com as
seguintes colunas:

```text
SETOR | ATUADOR | DATA/HORA | VAZÃO | VOLUME | NOTA
```

As colunas antigas `ADDR`, `FIR`, `PRODUTO`, `INJETADO (L)` e
`PROGRAMADO (L)` serão removidas. O parser antigo de `NOTE` não fará parte do
novo fluxo.

## Validação de consistência

O schema deve conferir:

- `windowStart` anterior a `windowEnd`;
- quantidade de tabelas encontrada em todos os setores igual a
  `summary.tables` e aos aliases publicados;
- soma de todas as linhas igual a `summary.rows` e `summary.totalRows`;
- `summary.tablesWithMatches` igual à quantidade de tabelas retornadas;
- `summary.totalTables` não inferior à quantidade de tabelas retornadas.

O limite existente de 1.048.575 linhas de dados por planilha será preservado.

## Erros

- cache inexistente na API de cálculo: HTTP `404`;
- timeout ao consultar o datapool: HTTP `504`;
- indisponibilidade do datapool: HTTP `503`;
- documento incompatível com o novo contrato: HTTP `502`;
- documento acima do limite do Excel: HTTP `422`;
- falha interna ao gerar a planilha: HTTP `500`.

## Testes

Os testes unitários de schema, cliente, controller e workbook serão atualizados
para o novo contrato. A integração do workbook usará uma fixture reduzida,
derivada do snapshot real de `maringa-citrosuco`, contendo mais de um setor,
mais de um atuador, `NOTE` textual e `NOTE: null`.

A verificação final incluirá:

```text
npm.cmd test -- --runInBand
npm.cmd test -- --config test/jest-integration.json --runInBand
npm.cmd run build
```

## Fora de escopo

- aceitar o contrato antigo em paralelo;
- alterar o endpoint da API de cálculo;
- criar PDF de atuadores;
- criar uma aba por setor;
- disparar uma nova varredura de atuadores pela API de PDFs.
