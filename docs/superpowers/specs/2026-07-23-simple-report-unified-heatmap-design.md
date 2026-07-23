# Relatório simples com mapa de calor unificado

## Objetivo

O relatório `simple` deve usar exatamente o mesmo template legado atualmente
usado pelo relatório `detailed`. A única diferença visual será o mapa de calor:

- `detailed`: mantém os painéis separados de Automação e Sensores;
- `simple`: mostra todos os dispositivos em um único painel chamado
  **Dispositivos**.

Cabeçalho, indicadores, gráficos, inventário, dados, estilos, impressão e rodapé
permanecem iguais entre as duas variantes.

## Arquitetura

O renderer legado em `src/pdf/report-html.ts` receberá uma opção explícita de
modo do mapa de calor:

```ts
type HeatmapMode = 'split' | 'unified';
```

O padrão será `split`, preservando o comportamento atual e a compatibilidade das
chamadas existentes. No modo `unified`, os dispositivos de Automação e
Sensoriamento serão concatenados na ordem já produzida pelo modelo e enviados
ao mesmo componente de célula do mapa.

O serviço de documento continuará usando o mesmo mapeamento e o mesmo
`ReportViewModelBuilder` para as duas variantes. O `ReportHtmlRenderer`
selecionará somente o modo do mapa:

- `simple` → `unified`;
- `detailed` ou tipo omitido → `split`.

Não haverá cópia do template nem pós-processamento do HTML.

## Dados e fallbacks

O mapa unificado usará os mesmos dispositivos e estados já normalizados pelo
modelo legado. Arrays vazios continuarão produzindo o estado vazio existente,
sem lançar erro. Valores nulos ou ausentes manterão os fallbacks atuais do
renderer.

## Testes

Os testes devem comprovar que:

1. o relatório `simple` contém um único painel de mapa de calor chamado
   `Dispositivos`;
2. o relatório `simple` não contém os painéis `Automação` e `Sensores`;
3. o relatório `detailed` continua contendo os dois painéis atuais;
4. todas as demais seções estruturais aparecem nas duas variantes;
5. a geração real de PDF continua válida para ambos os tipos.

Nenhuma alteração será feita no relatório detalhado, nos contratos de entrada,
nos cálculos ou no inventário.
