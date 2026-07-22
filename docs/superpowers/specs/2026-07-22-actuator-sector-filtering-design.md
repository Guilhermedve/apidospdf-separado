# Filtragem de setores na planilha de atuadores

## Objetivo

Permitir que consumidores descubram os setores disponíveis no snapshot de atuadores e gerem a planilha Excel com todos os setores ou com uma seleção explícita.

## Dependência

Esta funcionalidade depende da implementação do novo contrato descrito em `2026-07-22-actuator-new-log-contract-design.md`, no qual o documento possui `sectors[setor].tables[atuador]` e linhas com `TIME`, `FLOW`, `VOL` e `NOTE`.

## Listagem de setores

Adicionar:

```http
GET /actuators/farms/:farm/sectors
```

Resposta 200:

```json
{
  "farmSlug": "maringa-citrosuco",
  "sectors": [
    "SETOR_FILTRO_H_OP2_P2",
    "SETOR_FILTRO_H_OP3_P3"
  ]
}
```

Os nomes virão das chaves de `document.sectors`, serão únicos e ordenados com `Intl.Collator('pt-BR', { numeric: true })`. A resposta poderá conter `sectors: []` quando o snapshot válido não possuir setores.

O endpoint reutilizará `ActuatorCacheClient`. Cache ausente continuará retornando 404; erros transitórios e documento inválido manterão os mapeamentos HTTP existentes.

## Download filtrado

Preservar a rota pública:

```http
GET /actuators/farms/:farm/excel
```

Adicionar parâmetros repetidos opcionais:

```http
GET /actuators/farms/:farm/excel?sector=SETOR_A&sector=SETOR_B
```

Regras:

- sem `sector`, incluir todos os setores;
- aceitar um valor ou uma lista de valores repetidos;
- rejeitar valores vazios ou somente com espaços;
- remover duplicatas após validação, preservando os nomes exatos;
- exigir correspondência exata com as chaves de `document.sectors`;
- retornar HTTP 400 com os nomes desconhecidos quando qualquer setor não existir;
- filtrar antes da contagem de linhas e da validação do limite do Excel;
- manter ordenação natural por setor e atuador e cronológica por `TIME`;
- manter as seis colunas `SETOR | ATUADOR | DATA/HORA | VAZÃO | VOLUME | NOTA`.

## Componentes

- `ActuatorExcelController` recebe e valida a query, lista setores e coordena o download.
- `ActuatorCacheClient` permanece responsável apenas por buscar e validar o snapshot.
- `ActuatorWorkbookService` recebe a seleção opcional e escreve somente os setores aprovados.
- Um helper pequeno e puro normaliza `string | string[] | undefined`, remove duplicatas e valida a seleção contra o documento.

## Erros

- `400`: parâmetro vazio ou setor desconhecido;
- `404`: snapshot da fazenda ausente;
- `413`: seleção ainda excede o limite de linhas do Excel;
- demais erros: preservar os mapeamentos existentes da API de atuadores.

## Testes

- listagem ordenada de setores e lista vazia;
- exportação sem filtro;
- exportação com um setor;
- exportação com vários parâmetros repetidos;
- deduplicação;
- parâmetro vazio e setor desconhecido;
- limite do Excel aplicado após o filtro;
- integração reabrindo o XLSX e confirmando apenas os setores escolhidos;
- preservação das seis colunas e da ordenação aprovada.

## Fora do escopo

- Filtrar atuadores individuais, datas ou colunas.
- Alterar o snapshot persistido pela API de cálculo.
- Criar cache sob demanda.
- Alterar autenticação ou autorização por fazenda.
