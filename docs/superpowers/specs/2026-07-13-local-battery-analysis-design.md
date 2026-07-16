# Cálculo local de saúde da bateria no PDF

## Objetivo

A API de PDF deve recalcular a análise de bateria a partir dos registros `raw` recebidos no documento de período. O comportamento deve reproduzir, tanto quanto possível, as regras de `battery-analysis.service.ts`, sem alterar o layout do relatório nem a API de diagnóstico que fornece os dados.

O diagnóstico recebido continuará disponível como fallback. Quando o cálculo local for possível, ele será a fonte de `health` e `legacy` usada pelo PDF.

## Escopo

Incluído:

- cálculo local por dispositivo a partir de `BatteryRawRow`;
- regras distintas para modelos `SOLAR` e `FONTE`;
- semântica específica para períodos `3h`, `3d` e `7d`;
- recálculo de pontuação, estado, diagnóstico, confiança, motivos e série diária;
- recálculo dos campos legados usados pelo template;
- preservação dos sinais ortogonais recebidos da API;
- fallback seguro para o diagnóstico remoto;
- testes unitários e de integração entre análise, mapper e view model.

Não incluído:

- mudanças na API de cálculo ou no cache de períodos;
- mudanças no HTML/CSS ou na organização visual do PDF;
- recálculo de `stats`;
- novos diagnósticos além dos existentes no serviço de referência;
- persistência ou cache adicional de resultados calculados pelo PDF.

## Arquitetura

Será criado `src/battery/battery-analysis.service.ts`. O serviço será independente do mapper e receberá os dados necessários por uma interface explícita:

- `raw`: registros do dispositivo;
- `modelType`: `SOLAR`, `FONTE` ou desconhecido;
- `period`: `3h`, `3d` ou `7d`;
- `windowEnd`: fim da janela do documento.

O resultado terá:

- `health`: análise principal usada pelo relatório;
- `legacy`: análise compatível com os campos legados esperados pelo template.

`BatteryReportMapper` passará a depender de `BatteryAnalysisService`. Para cada dispositivo selecionado, tentará obter a análise local e montará um novo `BatteryReportDevice`, sem alterar o documento recebido.

`BatteryModule` registrará e exportará o novo serviço. O restante do pipeline continuará igual: seleção de dispositivos, mapper, view model, adaptador legado, HTML e Puppeteer.

## Fluxo de dados

1. `ReportDocumentService` seleciona os dispositivos solicitados.
2. `BatteryReportMapper` recebe o documento e os dispositivos selecionados.
3. Para cada dispositivo, `BatteryAnalysisService` normaliza os registros `raw` válidos.
4. O serviço calcula a análise diária, agrega o período e executa a regra específica de `SOLAR` ou `FONTE`.
5. O mapper usa o resultado local para `health` e `legacy`.
6. `flags` e `signals` recebidos da API são incorporados ao novo `health`, pois não fazem parte do algoritmo de referência.
7. O view model e o template continuam consumindo o mesmo contrato interno.

## Normalização dos registros

Somente registros com tensão numérica maior que 10 V e menor que 15 V entram no cálculo, seguindo o serviço de referência. Os registros serão ordenados cronologicamente antes da análise.

Os agrupamentos por hora e dia usarão `America/Fortaleza`, evitando que o resultado varie conforme o fuso horário do contêiner. `windowEnd` será a referência para regras relativas como “ontem”, em vez do relógio atual do processo. Isso mantém o cálculo correto para documentos armazenados e torna os testes determinísticos.

Os registros `raw` originais e as estatísticas recebidas não serão modificados.

## Semântica dos períodos

### `3h`

- `shortWindow: true`;
- `periodHours: 3`;
- mínimo de 3 amostras válidas para compor o estado recente;
- pontuação máxima limitada a 69 quando a janela não permite inferir vida útil;
- tensão baixa pode produzir `BAIXA_TENSAO_RECENTE`;
- comportamento normal na janela curta será apresentado como `DADOS_INSUFICIENTES` para tendência de vida útil;
- regras diárias de carga não serão aplicadas.

### `3d`

- `shortWindow: false`;
- `periodDays: 3`;
- mínimo de 10 amostras por dia válido;
- confiança `MEDIA` com 3 dias válidos e `BAIXA` abaixo disso;
- recorrência será avaliada com as mesmas regras do serviço de referência.

### `7d`

- `shortWindow: false`;
- `periodDays: 7`;
- mínimo de 10 amostras por dia válido;
- confiança `ALTA` com 7 dias válidos, `MEDIA` com pelo menos 3 e `BAIXA` abaixo disso;
- tendências e falhas recorrentes usam todos os dias válidos, com peso maior para os 3 dias mais recentes.

## Cálculo principal de saúde

As faixas e pesos serão portados do arquivo de referência:

- pontuação SOC por amostra nas bandas de 12,7 V, 12,4 V, 12,2 V, 12,0 V e 11,8 V;
- baixa tensão abaixo de 12,1 V;
- tensão crítica abaixo de 11,8 V;
- carga completa a partir de 14,0 V;
- falha forte de carga abaixo de 13,5 V;
- queda noturna forte a partir de 1,2 V;
- recorrência mínima de 3 dias.

O serviço produzirá os diagnósticos existentes:

- `NORMAL`;
- `BATERIA_FRACA`;
- `FALHA_CARGA`;
- `DESCARGA_EXCESSIVA`;
- `BAIXA_TENSAO_RECENTE`;
- `DADOS_INSUFICIENTES`.

A pontuação agregada manterá peso 1,3 para os três dias válidos mais recentes e peso 1,0 para os demais. O estado de vida será classificado como `OK`, `ATENCAO` ou `CRITICO` pelas mesmas faixas do serviço de referência.

## Análise por modelo e contrato legado

O caminho de cálculo será escolhido por `device.modelType`, que já é normalizado pela API de origem:

- `SOLAR`: preserva cálculo de tensão mínima, percentual em baixa tensão, eficiência de carga, ciclos, estado da bateria, estado da carga e performance ponderada;
- `FONTE`: preserva cálculo de tensão mínima, quedas bruscas, estado e performance específicos de alimentação por fonte.

O template atual espera um formato legado único. O resultado `FONTE` será adaptado sem mudar suas regras:

- `statusBateria` e `motivoBateria` representarão o estado e motivo da fonte;
- campos solares não aplicáveis serão neutros;
- `motivoCarga` indicará que a regra diária solar não se aplica;
- `performance` será a performance calculada pelo caminho `FONTE`.

Essa adaptação mantém o contrato do relatório sem forçar um dispositivo `FONTE` a passar pela análise solar.

## Preservação de sinais remotos

`flags` e `signals` são ortogonais ao diagnóstico principal e não existem no serviço de referência. Por isso:

- `flags` serão copiados do diagnóstico remoto;
- `signals.brownout` e `signals.chargeTrend` serão copiados quando válidos;
- valores remotos `null` incompatíveis com o contrato local serão tratados como sinal ausente, nunca convertidos artificialmente para zero;
- esses campos não mudarão a pontuação local nesta etapa.

## Fallback e erros

O mapper usará `health` e `legacy` remotos quando qualquer uma destas condições ocorrer:

- dispositivo com `status` diferente de `ready`;
- `modelType` desconhecido;
- nenhum registro de bateria válido;
- quantidade insuficiente até mesmo para formar a análise local mínima;
- falha controlada do analisador para um dispositivo.

Uma falha isolada não impedirá o relatório dos demais dispositivos. O fallback será aplicado somente ao dispositivo afetado. Erros de programação ou violações inesperadas do contrato não serão silenciosamente ocultados; os testes devem expor esses casos.

## Alterações previstas

- adicionar `src/battery/battery-analysis.service.ts`;
- adicionar tipos internos específicos da análise em `src/battery/battery-analysis.types.ts`, se necessários;
- atualizar `src/battery/battery-report.mapper.ts` para recalcular por dispositivo;
- atualizar `src/battery/battery.module.ts` para registrar o serviço;
- ajustar `src/battery/battery-report.types.ts` apenas onde o contrato calculado exigir;
- atualizar os testes do mapper;
- adicionar testes unitários próprios do analisador.

O arquivo de referência na raiz permanecerá inalterado para comparação durante a implementação.

## Estratégia de testes

Os testes usarão séries sintéticas com datas fixas e amostras suficientes para isolar cada regra.

Casos obrigatórios:

- `3h` com tensão normal resulta em tendência inconclusiva e confiança baixa;
- `3h` com tensão abaixo de 12,1 V resulta em baixa tensão recente;
- `3d` solar saudável produz estado normal com confiança média;
- falha recorrente em atingir 14,0 V produz `FALHA_CARGA`;
- carga seguida de queda recorrente abaixo de 12,1 V produz `BATERIA_FRACA`;
- permanência excessiva em baixa tensão produz `DESCARGA_EXCESSIVA`;
- `7d` com sete dias válidos produz confiança alta;
- caminho `FONTE` usa cálculo de quedas bruscas e não a regra solar;
- modelo desconhecido usa fallback remoto;
- ausência de registros válidos usa fallback remoto;
- `flags/signals` remotos válidos são preservados;
- `slopePerDay: null` é tratado como sinal ausente;
- documento, dispositivo e arrays `raw` recebidos não são alterados;
- testes atuais do mapper, view model e renderer continuam passando.

## Critérios de aceitação

- o PDF usa cálculo local derivado de `raw` para todo dispositivo analisável;
- os resultados seguem as constantes, faixas, recorrências e pesos do serviço de referência;
- `SOLAR` e `FONTE` percorrem caminhos distintos;
- `3h`, `3d` e `7d` produzem confiança e interpretação adequadas à janela;
- o diagnóstico remoto aparece somente como fallback;
- sinais remotos ortogonais são preservados sem fabricar valores;
- o layout e o contrato público do PDF não mudam;
- build e suíte de testes passam.
