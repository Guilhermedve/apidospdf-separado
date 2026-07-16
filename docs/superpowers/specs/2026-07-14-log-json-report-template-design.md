# Integração do `log.json` com o modelo atual de PDF

## Objetivo

Preservar integralmente o modelo visual da API antiga que está em
`src/pdf/report-html.ts` e torná-lo a única fonte do HTML usado pela API atual.
Os dados devem vir do contrato real do `log.json`, sem reconstruir ou simplificar
o layout.

## Escopo

- Usar `src/pdf/report-html.ts` no fluxo efetivo de geração de documentos.
- Adaptar o documento de período validado para os campos exigidos pelo modelo.
- Preservar as análises locais e os fallbacks já existentes.
- Cobrir a integração com testes de regressão.
- Não alterar endpoints, armazenamento, fila, retenção ou o desenho visual.

## Contrato de entrada

O documento possui `farm`, `period`, `generatedAt`, `windowStart`, `windowEnd`,
`devices` e `summary`. `devices` é um objeto indexado pelo endereço formatado do
DIR. Cada dispositivo contém os dados cadastrais e operacionais, incluindo
`stats`, `health`, `legacy` e `raw`.

O schema do datapool continua sendo a fronteira de validação. O template não
deve acessar o JSON bruto nem conhecer sua organização indexada.

## Fluxo de dados

1. O datapool lê e valida o documento de período.
2. A seleção de dispositivos escolhe os DIRs incluídos no relatório.
3. `BatteryReportMapper` converte os dispositivos selecionados e recalcula a
   análise local quando há amostras válidas, mantendo o fallback remoto por DIR.
4. `ReportViewModelBuilder` produz o modelo de apresentação.
5. O adapter converte esse modelo somente para os campos consumidos pelo modelo
   visual antigo.
6. `ReportHtmlRenderer` chama diretamente o renderer exportado por
   `src/pdf/report-html.ts`.
7. `PdfService` imprime o HTML resultante sem mudança no comportamento atual.

## Fonte única do modelo

`src/pdf/report-html.ts` será a fonte visual única. A cópia
`src/template/legacy-report-html.ts` deixará de participar do fluxo e poderá ser
removida depois que todos os imports e testes apontarem para a fonte oficial.

Os tipos usados pelo arquivo serão conectados aos tipos de compatibilidade da
camada de template. O modelo visual continuará recebendo um objeto adaptado, em
vez de depender diretamente do schema do datapool.

## Mapeamento relevante

- Fazenda: `farm` -> nome do cliente exibido.
- Período: `3h`, `3d` ou `7d` -> horas/dias exibidos no cabeçalho.
- Endereço: chave/endereço do dispositivo -> `DIR NNN`.
- Classificação e função: `classification` e `primaryFunctionLabel`.
- Alimentação: `modelType` -> solar ou fonte.
- Tensão mínima: `stats.minBat`, com fallback compatível em `legacy.minBat`.
- Saúde: `health.healthScore` e `health.lifeStatus`.
- Diagnóstico, confiança, motivos e tendência diária: campos de `health`, com os
  fallbacks legados já definidos no pipeline.

## Presença de dados no período

A API deve determinar a presença de dados antes de montar o modelo visual. Para
cada dispositivo, somente registros `raw` com `time` entre `windowStart` e
`windowEnd`, inclusive, e com `bat` numérico finito contam como amostras válidas
do período. As fronteiras do próprio documento são a referência temporal; o
relógio da máquina não participa dessa decisão.

O modelo interno deve carregar `hasDataInPeriod` e `samplesInPeriod`. Quando não
houver amostra válida, o DIR permanece no relatório, recebe o estado neutro
`SEM_DADOS` e exibe `FALTA DE DADOS NO PERÍODO SELECIONADO` no lugar do
percentual. Esses dispositivos não contam como saudáveis, atenção ou críticos e
não participam do denominador da saúde geral.

Campos ausentes ou inválidos não devem gerar valores clínicos inventados. O
comportamento existente de dados insuficientes e os fallbacks por dispositivo
serão preservados.

## Tratamento de erros

- Documento incompatível continua sendo rejeitado pelo schema do datapool.
- Falha na análise local de um DIR mantém os dados remotos desse DIR sem impedir
  os demais dispositivos.
- Valores opcionais ausentes usam os fallbacks atuais do builder/adapter.
- Conteúdo textual continua escapado pelo template antes de entrar no HTML.

## Testes e verificação

- Teste de regressão do renderer comprovando que ele usa
  `src/pdf/report-html.ts`.
- Teste com documento no formato real do `log.json`, cobrindo fazenda, período,
  DIR, função, tensão mínima, saúde e diagnóstico.
- Testes de fronteira temporal, amostras antigas e ausência de dados válidos no
  período.
- Testes visuais do estado neutro no mapa de calor e inventário, comprovando que
  `0%` não é exibido como saúde quando não há dados.
- Testes focados do mapper, builder, adapter, renderer e documento.
- Compilação TypeScript sem emissão.
- Geração de um PDF de prova e verificação de existência, assinatura `%PDF-` e
  tamanho não trivial.

## Critério de aceite

A API atual gera o PDF usando o visual de `src/pdf/report-html.ts`, preenchido
com os dados do contrato real de `log.json`, sem depender de uma segunda cópia
do modelo e sem regressões nos testes existentes.
