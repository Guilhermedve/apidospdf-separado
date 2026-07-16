# API de geração de PDF de bateria — Plano de implementação

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. As etapas usam caixas de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** construir do zero uma API NestJS que recebe filtros de fazenda, período e dispositivos, consome o JSON pronto da datapool, gera um PDF de bateria em job assíncrono e o disponibiliza por 30 minutos.

**Arquitetura:** a API HTTP cria e consulta jobs; um worker BullMQ separado busca e valida a datapool, transforma os dados, renderiza HTML e gera o PDF com Puppeteer. Redis guarda fila e metadados; um volume local compartilhado guarda somente PDFs temporários, removidos após 30 minutos.

**Stack:** Node.js, TypeScript, NestJS, BullMQ, Redis, Fetch nativo, Zod, Puppeteer, Jest, Supertest e Docker Compose.

## Restrições globais

- Implementar somente relatórios de bateria.
- Aceitar somente os períodos `3h`, `3d` e `7d`.
- Não acessar SSH, MySQL ou o volume da Raspberry Pi.
- Não chamar endpoints da datapool que iniciem cálculos.
- Cada solicitação cria um PDF novo; não implementar cache, hash ou deduplicação.
- Manter o PDF disponível por 30 minutos contados a partir do estado `ready`.
- Downloads não renovam a expiração.
- Não armazenar o JSON completo nem o PDF no Redis.
- Escrever primeiro `<jobId>.tmp.pdf` e renomear atomicamente para `<jobId>.pdf`.
- Repetir somente erros transitórios, com uma tentativa original e no máximo duas repetições.
- Usar `log.json` como fixture inicial de contrato.
- Portar do sistema antigo somente regras visuais, cálculos do relatório, HTML, CSS e gráficos.
- Não iniciar implementação de sensores, atuadores, S3 ou autenticação de clientes.

---

## Estrutura de arquivos planejada

```text
.
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── jest.config.ts
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── src
│   ├── main.ts
│   ├── worker.ts
│   ├── app.module.ts
│   ├── worker.module.ts
│   ├── config
│   │   ├── app-config.schema.ts
│   │   ├── app-config.service.ts
│   │   └── config.module.ts
│   ├── common
│   │   ├── errors
│   │   │   ├── application-error.ts
│   │   │   ├── error-codes.ts
│   │   │   └── http-error.filter.ts
│   │   └── logging
│   │       └── log-context.ts
│   ├── datapool
│   │   ├── datapool.module.ts
│   │   ├── datapool.client.ts
│   │   ├── datapool.errors.ts
│   │   ├── datapool.schema.ts
│   │   └── datapool.types.ts
│   ├── battery
│   │   ├── battery.module.ts
│   │   ├── battery-report.mapper.ts
│   │   ├── battery-report.types.ts
│   │   └── device-selection.service.ts
│   ├── reports
│   │   ├── reports.module.ts
│   │   ├── reports.controller.ts
│   │   ├── reports.service.ts
│   │   ├── reports.queue.ts
│   │   ├── report.processor.ts
│   │   ├── report-job.types.ts
│   │   ├── report-status.presenter.ts
│   │   └── dto
│   │       └── create-report.dto.ts
│   ├── template
│   │   ├── template.module.ts
│   │   ├── report-view-model.builder.ts
│   │   ├── report-view-model.types.ts
│   │   ├── report-html.renderer.ts
│   │   ├── report-styles.ts
│   │   └── report-client-script.ts
│   ├── pdf
│   │   ├── pdf.module.ts
│   │   ├── pdf.service.ts
│   │   └── pdf-browser.provider.ts
│   ├── storage
│   │   ├── storage.module.ts
│   │   ├── report-storage.service.ts
│   │   └── expired-report-cleaner.service.ts
│   └── health
│       ├── health.module.ts
│       ├── health.controller.ts
│       └── health.service.ts
└── test
    ├── fixtures
    │   └── datapool
    │       └── entre-rios-3d.json
    ├── unit
    ├── integration
    ├── e2e
    └── visual
        └── README.md
```

A divisão mantém controller, fila, contrato externo, modelo interno, template, Puppeteer e armazenamento testáveis separadamente.

---

### Tarefa 1: Fundação executável e configuração validada

**Arquivos:**

- Criar: `package.json`
- Criar: `tsconfig.json`
- Criar: `tsconfig.build.json`
- Criar: `nest-cli.json`
- Criar: `jest.config.ts`
- Criar: `.env.example`
- Criar: `src/main.ts`
- Criar: `src/app.module.ts`
- Criar: `src/config/app-config.schema.ts`
- Criar: `src/config/app-config.service.ts`
- Criar: `src/config/config.module.ts`
- Testar: `test/unit/config/app-config.schema.spec.ts`

**Interfaces:**

- Produz: `AppConfig`, `parseAppConfig(env: NodeJS.ProcessEnv): AppConfig` e `AppConfigService`.
- Consumido por: datapool, Redis, worker, PDF, storage e health.

```ts
export type ReportPeriod = '3h' | '3d' | '7d';

export interface AppConfig {
  port: number;
  datapoolBaseUrl: string;
  datapoolTimeoutMs: number;
  datapoolMaxAgeMinutes: number;
  redisUrl: string;
  reportsStoragePath: string;
  reportRetentionMinutes: 30;
  reportWorkerConcurrency: number;
  pdfTimeoutMs: number;
}
```

- [ ] **Etapa 1: escrever o teste falhando da configuração**

```ts
it('rejeita retenção diferente de 30 minutos', () => {
  expect(() =>
    parseAppConfig(validEnv({ REPORT_RETENTION_MINUTES: '60' })),
  ).toThrow('REPORT_RETENTION_MINUTES');
});

it('normaliza a URL da datapool sem barra final', () => {
  const config = parseAppConfig(
    validEnv({ DATAPOOL_BASE_URL: 'https://datapool.example.ts.net/' }),
  );
  expect(config.datapoolBaseUrl).toBe('https://datapool.example.ts.net');
});
```

- [ ] **Etapa 2: executar e confirmar a falha**

Executar: `npm test -- test/unit/config/app-config.schema.spec.ts`

Esperado: FAIL porque `parseAppConfig` ainda não existe.

- [ ] **Etapa 3: implementar a configuração mínima**

Usar Zod com valores obrigatórios e limites positivos. Fixar `reportRetentionMinutes` no literal `30`. Habilitar no bootstrap `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.

- [ ] **Etapa 4: executar testes e compilação**

Executar: `npm test -- test/unit/config/app-config.schema.spec.ts`

Executar: `npm run build`

Esperado: testes PASS e build sem erros.

- [ ] **Etapa 5: registrar a entrega**

```bash
git add package.json tsconfig.json tsconfig.build.json nest-cli.json jest.config.ts .env.example src/main.ts src/app.module.ts src/config test/unit/config
git commit -m "chore: bootstrap battery pdf api"
```

---

### Tarefa 2: Contrato externo da datapool

**Arquivos:**

- Criar: `src/datapool/datapool.schema.ts`
- Criar: `src/datapool/datapool.types.ts`
- Copiar fixture: `log.json` para `test/fixtures/datapool/entre-rios-3d.json`
- Criar: `test/unit/datapool/datapool.schema.spec.ts`

**Interfaces:**

- Produz: `DatapoolPeriodDocument`, `DatapoolDevice`, `parseDatapoolPeriodDocument(input: unknown): DatapoolPeriodDocument`.
- Consumido por: `DatapoolClient`, `DeviceSelectionService` e `BatteryReportMapper`.

```ts
export interface DatapoolPeriodDocument {
  farm: string;
  period: ReportPeriod;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  devices: Record<string, DatapoolDevice>;
  summary: {
    totalDevices: number;
    readyDevices: number;
    failedDevices: number;
    totalRows: number;
  };
}
```

- [ ] **Etapa 1: copiar a fixture sem alterá-la**

A cópia preserva o documento real e permite que os testes não dependam da raiz do projeto.

- [ ] **Etapa 2: escrever testes de contrato**

```ts
it('aceita a fixture real de 3d', () => {
  const parsed = parseDatapoolPeriodDocument(fixture);
  expect(parsed.period).toBe('3d');
  expect(Object.keys(parsed.devices)).toHaveLength(42);
});

it('rejeita chave de mapa diferente do addr normalizado', () => {
  const changed = structuredClone(fixture);
  changed.devices['045'].addr = 44;
  expect(() => parseDatapoolPeriodDocument(changed)).toThrow(
    'devices.045.addr',
  );
});
```

Também testar datas inválidas, `windowStart >= windowEnd`, período inválido e ausência de `raw`, `stats`, `health` ou `legacy`.

- [ ] **Etapa 3: executar e confirmar a falha**

Executar: `npm test -- test/unit/datapool/datapool.schema.spec.ts`

Esperado: FAIL por módulo ausente.

- [ ] **Etapa 4: implementar schema estrito**

Usar Zod `.strict()`, validar timestamps ISO e aplicar `superRefine` para coerência entre chave e ADDR, janela temporal e totais não negativos.

- [ ] **Etapa 5: executar testes**

Executar: `npm test -- test/unit/datapool/datapool.schema.spec.ts`

Esperado: PASS.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/datapool/datapool.schema.ts src/datapool/datapool.types.ts test/fixtures/datapool/entre-rios-3d.json test/unit/datapool/datapool.schema.spec.ts
git commit -m "feat: validate datapool battery contract"
```

---

### Tarefa 3: Erros estáveis e cliente HTTP da datapool

**Arquivos:**

- Criar: `src/common/errors/error-codes.ts`
- Criar: `src/common/errors/application-error.ts`
- Criar: `src/common/errors/http-error.filter.ts`
- Criar: `src/datapool/datapool.errors.ts`
- Criar: `src/datapool/datapool.client.ts`
- Criar: `src/datapool/datapool.module.ts`
- Testar: `test/unit/datapool/datapool.client.spec.ts`

**Interfaces:**

- Consome: `AppConfigService`, `ReportPeriod`, `parseDatapoolPeriodDocument`.
- Produz:

```ts
interface DatapoolClient {
  getPeriod(
    farmSlug: string,
    period: ReportPeriod,
    signal?: AbortSignal,
  ): Promise<DatapoolPeriodDocument>;
}
```

- [ ] **Etapa 1: escrever testes de URL, validação e erro**

```ts
it('consulta somente o endpoint de leitura do período', async () => {
  await client.getPeriod('entre-rios', '3d');
  expect(http.get).toHaveBeenCalledWith(
    '/diagnostics/farms/entre-rios/periods/3d',
    expect.objectContaining({ timeout: 60_000 }),
  );
});

it.each([429, 502, 503, 504])(
  'marca HTTP %s como transitório',
  async (status) => {
    http.get.mockRejectedValueOnce(httpStatusError(status));
    await expect(client.getPeriod('entre-rios', '3d')).rejects.toMatchObject({
      code: 'DATAPOOL_UNAVAILABLE',
      retryable: true,
    });
  },
);
```

Testar `404 -> FARM_NOT_FOUND`, resposta fora do schema, período divergente e cache remoto acima de `datapoolMaxAgeMinutes`.

- [ ] **Etapa 2: confirmar falha**

Executar: `npm test -- test/unit/datapool/datapool.client.spec.ts`

Esperado: FAIL.

- [ ] **Etapa 3: implementar cliente mínimo**

Usar o `fetch` nativo do Node com `AbortSignal.timeout`, `Accept-Encoding: gzip, br` e o gerenciamento de conexões persistentes do runtime. Aplicar `encodeURIComponent` ao slug, validar resposta e comparar `generatedAt` com relógio injetável.

- [ ] **Etapa 4: executar teste e build**

Executar: `npm test -- test/unit/datapool/datapool.client.spec.ts`

Executar: `npm run build`

Esperado: PASS.

- [ ] **Etapa 5: registrar a entrega**

```bash
git add src/common/errors src/datapool test/unit/datapool/datapool.client.spec.ts
git commit -m "feat: add typed datapool client"
```

---

### Tarefa 4: DTO, modelo do job e endpoints iniciais

**Arquivos:**

- Criar: `src/reports/dto/create-report.dto.ts`
- Criar: `src/reports/report-job.types.ts`
- Criar: `src/reports/report-status.presenter.ts`
- Criar: `src/reports/reports.controller.ts`
- Criar: `src/reports/reports.service.ts`
- Criar: `src/reports/reports.module.ts`
- Testar: `test/unit/reports/create-report.dto.spec.ts`
- Testar: `test/unit/reports/reports.controller.spec.ts`

**Interfaces:**

```ts
export interface CreateReportCommand {
  farmSlug: string;
  period: ReportPeriod;
  deviceAddrs?: string[];
}

export interface GenerateReportJobData extends CreateReportCommand {
  requestedAt: string;
}

export interface QueuedReport {
  jobId: string;
  status: 'queued';
  statusUrl: string;
  expiresInMinutes: 30;
}

export type ReportJobState =
  | 'queued'
  | 'fetching-data'
  | 'processing-data'
  | 'rendering-html'
  | 'generating-pdf'
  | 'ready'
  | 'failed'
  | 'expired';

export interface ReportArtifactMetadata {
  fileName: string;
  generatedAt: string;
  expiresAt: string;
}

export interface ReportJobSnapshot {
  jobId: string;
  state: ReportJobState;
  result?: ReportArtifactMetadata;
  errorCode?: ErrorCode;
}

export interface PublicReportStatus {
  jobId: string;
  status: ReportJobState;
  downloadUrl?: string;
  generatedAt?: string;
  expiresAt?: string;
  error?: { code: ErrorCode; message: string };
}
```

- [ ] **Etapa 1: escrever testes do DTO**

```ts
it('normaliza addr numérico para três dígitos e remove espaços', () => {
  const dto = transformAndValidate({
    farmSlug: 'entre-rios',
    period: '3d',
    deviceAddrs: [' 45 ', '038'],
  });
  expect(dto.deviceAddrs).toEqual(['045', '038']);
});

it.each(['2h', '1d', '30d'])('rejeita período %s', async (period) => {
  await expectValidation({ farmSlug: 'entre-rios', period }).rejects.toBeDefined();
});
```

Testar duplicatas, lista vazia, ADDR fora de `000..999` e propriedade desconhecida.

- [ ] **Etapa 2: escrever teste do controller**

Verificar `POST /reports`, `GET /reports/:jobId` e `GET /reports/:jobId/download` delegando ao serviço, sem lógica de fila ou filesystem no controller.

- [ ] **Etapa 3: executar e confirmar falha**

Executar: `npm test -- test/unit/reports`

Esperado: FAIL.

- [ ] **Etapa 4: implementar DTO, tipos, presenter e controller**

O presenter deve expor apenas estados públicos e mensagens seguras. Download deve delegar a abertura do stream ao serviço e definir os headers pelo nome fornecido pelo storage.

- [ ] **Etapa 5: executar testes**

Executar: `npm test -- test/unit/reports`

Executar: `npm run build`

Esperado: PASS.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/reports test/unit/reports
git commit -m "feat: define report http contract"
```

---

### Tarefa 5: BullMQ, Redis, criação e consulta do job

**Arquivos:**

- Criar: `src/reports/reports.queue.ts`
- Modificar: `src/reports/reports.service.ts`
- Modificar: `src/reports/reports.module.ts`
- Criar: `src/worker.ts`
- Criar: `src/worker.module.ts`
- Testar: `test/unit/reports/reports.service.spec.ts`
- Testar: `test/integration/reports/reports.queue.spec.ts`

**Interfaces:**

```ts
export const REPORT_QUEUE = 'battery-pdf-reports';
export const GENERATE_REPORT_JOB = 'generate-battery-pdf';

interface ReportsQueue {
  add(data: GenerateReportJobData): Promise<{ id: string }>;
  getStatus(jobId: string): Promise<ReportJobSnapshot | null>;
}
```

- [ ] **Etapa 1: testar que pedidos iguais criam IDs diferentes**

```ts
it('não deduplica solicitações idênticas', async () => {
  const first = await service.create(command);
  const second = await service.create(command);
  expect(first.jobId).not.toBe(second.jobId);
});
```

- [ ] **Etapa 2: testar opções da fila**

Esperar `attempts: 3`, backoff exponencial, remoção controlada de jobs concluídos somente após janela operacional e payload sem JSON da datapool.

- [ ] **Etapa 3: confirmar falha**

Executar: `npm test -- test/unit/reports/reports.service.spec.ts`

Esperado: FAIL.

- [ ] **Etapa 4: implementar adaptador BullMQ e worker bootstrap**

API registra `Queue`; worker registra `Worker`. Não iniciar worker no processo HTTP. Usar shutdown hooks para fechar conexões Redis.

- [ ] **Etapa 5: executar unidade e integração**

Executar: `npm test -- test/unit/reports/reports.service.spec.ts`

Executar com Redis de teste: `npm run test:integration -- test/integration/reports/reports.queue.spec.ts`

Esperado: PASS e conexão encerrada ao final.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/reports src/worker.ts src/worker.module.ts test/unit/reports/reports.service.spec.ts test/integration/reports/reports.queue.spec.ts
git commit -m "feat: enqueue battery pdf jobs"
```

---

### Tarefa 6: Seleção e modelo interno de bateria

**Arquivos:**

- Criar: `src/battery/battery-report.types.ts`
- Criar: `src/battery/device-selection.service.ts`
- Criar: `src/battery/battery-report.mapper.ts`
- Criar: `src/battery/battery.module.ts`
- Testar: `test/unit/battery/device-selection.service.spec.ts`
- Testar: `test/unit/battery/battery-report.mapper.spec.ts`

**Interfaces:**

```ts
export interface BatteryReportData {
  farm: string;
  period: ReportPeriod;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  devices: BatteryReportDevice[];
  sourceSummary: DatapoolPeriodDocument['summary'];
}

interface DeviceSelectionService {
  select(
    document: DatapoolPeriodDocument,
    requestedAddrs?: string[],
  ): DatapoolDevice[];
}

interface BatteryReportMapper {
  map(
    document: DatapoolPeriodDocument,
    selectedDevices: DatapoolDevice[],
  ): BatteryReportData;
}
```

- [ ] **Etapa 1: testar seleção**

```ts
it('mantém todos os dispositivos na ausência de filtro', () => {
  expect(service.select(document)).toHaveLength(42);
});

it('preserva a ordem solicitada e falha se um addr não existe', () => {
  expect(service.select(document, ['045', '038']).map((d) => d.addr))
    .toEqual([45, 38]);
  expect(() => service.select(document, ['999'])).toThrow('DEVICE_NOT_FOUND');
});
```

- [ ] **Etapa 2: testar mapper sem dependência HTTP**

Garantir cópia somente dos campos necessários e ordenação cronológica de `raw`. Não recalcular o diagnóstico já fornecido pela datapool; cálculos nesta camada servem apenas para o modelo do relatório.

- [ ] **Etapa 3: confirmar falha**

Executar: `npm test -- test/unit/battery`

Esperado: FAIL.

- [ ] **Etapa 4: implementar seleção e mapper**

Manter tipos internos independentes de Fetch, BullMQ e Puppeteer.

- [ ] **Etapa 5: executar testes**

Executar: `npm test -- test/unit/battery`

Executar: `npm run build`

Esperado: PASS.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/battery test/unit/battery
git commit -m "feat: map datapool devices to report data"
```

---

### Tarefa 7: Portar regras visuais para um view model puro

**Arquivos:**

- Criar: `src/template/report-view-model.types.ts`
- Criar: `src/template/report-view-model.builder.ts`
- Criar: `test/unit/template/report-view-model.builder.spec.ts`
- Criar: `test/fixtures/template/expected-entre-rios-summary.json`

**Interfaces:**

```ts
export interface ReportViewModel {
  title: string;
  farm: string;
  periodLabel: string;
  generatedAtLabel: string;
  summary: ReportSummaryViewModel;
  automationDevices: DeviceCardViewModel[];
  sensingDevices: DeviceCardViewModel[];
}

interface ReportViewModelBuilder {
  build(data: BatteryReportData): ReportViewModel;
}
```

- [ ] **Etapa 1: inventariar regras antigas antes de portar**

Registrar no início do teste os comportamentos observáveis do fluxo antigo: classificação em automação/sensoriamento, indicadores agregados, rótulos, cores, diagnóstico, estatísticas e séries de gráfico. Não copiar consultas, DTOs antigos ou código de banco.

- [ ] **Etapa 2: escrever golden tests do view model**

```ts
it('produz o resumo homologado para a fixture real', () => {
  const view = builder.build(reportData);
  expect({
    summary: view.summary,
    automationCount: view.automationDevices.length,
    sensingCount: view.sensingDevices.length,
  }).toEqual(expectedSummary);
});
```

Adicionar casos de dados insuficientes, dispositivo com erro e séries vazias.

- [ ] **Etapa 3: confirmar falha**

Executar: `npm test -- test/unit/template/report-view-model.builder.spec.ts`

Esperado: FAIL.

- [ ] **Etapa 4: portar o mínimo necessário**

Extrair funções puras pequenas para formatação, agrupamento, agregação e séries. A saída deve conter textos já decididos pelo domínio visual, sem HTML.

- [ ] **Etapa 5: executar testes**

Executar: `npm test -- test/unit/template/report-view-model.builder.spec.ts`

Esperado: PASS com snapshot/golden revisado manualmente.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/template/report-view-model.types.ts src/template/report-view-model.builder.ts test/unit/template test/fixtures/template
git commit -m "feat: port battery report presentation rules"
```

---

### Tarefa 8: Portar HTML, estilos e gráficos autocontidos

**Arquivos:**

- Criar: `src/template/report-html.renderer.ts`
- Criar: `src/template/report-styles.ts`
- Criar: `src/template/report-client-script.ts`
- Criar: `src/template/template.module.ts`
- Testar: `test/unit/template/report-html.renderer.spec.ts`

**Interfaces:**

```ts
export interface ReportHtmlRenderer {
  render(viewModel: ReportViewModel): string;
}
```

- [ ] **Etapa 1: escrever testes de segurança e autocontenção**

```ts
it('escapa texto dinâmico e não referencia recursos externos', () => {
  const html = renderer.render(viewModelWithFarm('<script>alert(1)</script>'));
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).toContain('&lt;script&gt;');
});
```

Verificar duas colunas nos cards onde o modelo antigo exige, seções de automação e sensoriamento, mini gráficos, CSS de impressão e payload serializado com escape seguro de `</script>`.

- [ ] **Etapa 2: confirmar falha**

Executar: `npm test -- test/unit/template/report-html.renderer.spec.ts`

Esperado: FAIL.

- [ ] **Etapa 3: portar o template**

Separar CSS e JavaScript em constantes TypeScript importadas pelo renderer. O HTML final deve ser uma única string autocontida, sem fontes, scripts ou imagens remotas.

- [ ] **Etapa 4: salvar amostra apenas como artefato de teste ignorado**

Adicionar script de teste que gere `tmp/report-preview.html`; não versionar saídas geradas.

- [ ] **Etapa 5: executar testes**

Executar: `npm test -- test/unit/template/report-html.renderer.spec.ts`

Esperado: PASS.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/template test/unit/template/report-html.renderer.spec.ts
git commit -m "feat: port self-contained battery report html"
```

---

### Tarefa 9: Armazenamento local seguro e expiração

**Arquivos:**

- Criar: `src/storage/report-storage.service.ts`
- Criar: `src/storage/expired-report-cleaner.service.ts`
- Criar: `src/storage/storage.module.ts`
- Testar: `test/unit/storage/report-storage.service.spec.ts`
- Testar: `test/integration/storage/expired-report-cleaner.spec.ts`

**Interfaces:**

```ts
export type StoredReport = ReportArtifactMetadata;

interface ReportStorageService {
  temporaryPath(jobId: string): string;
  finalPath(jobId: string): string;
  commit(jobId: string): Promise<StoredReport>;
  open(jobId: string): Promise<NodeJS.ReadableStream>;
  remove(jobId: string): Promise<void>;
}
```

- [ ] **Etapa 1: testar contenção de caminho**

```ts
it.each(['../x', 'a/b', 'a\\b', '.', ''])(
  'rejeita jobId inseguro: %s',
  (jobId) => expect(() => storage.finalPath(jobId)).toThrow('INVALID_JOB_ID'),
);
```

- [ ] **Etapa 2: testar rename e expiração**

Criar arquivo temporário em diretório isolado, chamar `commit`, verificar desaparecimento do `.tmp.pdf`, existência do final e `expiresAt = generatedAt + 30 min`. Avançar relógio e verificar remoção pelo cleaner. Confirmar que download não altera `expiresAt`.

- [ ] **Etapa 3: confirmar falha**

Executar: `npm test -- test/unit/storage test/integration/storage`

Esperado: FAIL.

- [ ] **Etapa 4: implementar storage e cleaner**

Usar `path.resolve` e confirmar que todo caminho permanece dentro de `reportsStoragePath`. Usar `rename` no mesmo volume. Cleaner deve tolerar arquivo já removido e registrar outros erros.

- [ ] **Etapa 5: executar testes**

Executar: `npm test -- test/unit/storage test/integration/storage`

Esperado: PASS.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/storage test/unit/storage test/integration/storage
git commit -m "feat: add expiring local report storage"
```

---

### Tarefa 10: Puppeteer e geração atômica

**Arquivos:**

- Criar: `src/pdf/pdf-browser.provider.ts`
- Criar: `src/pdf/pdf.service.ts`
- Criar: `src/pdf/pdf.module.ts`
- Testar: `test/unit/pdf/pdf.service.spec.ts`
- Testar: `test/integration/pdf/pdf.service.spec.ts`

**Interfaces:**

```ts
interface PdfService {
  generate(jobId: string, html: string): Promise<StoredReport>;
}
```

- [ ] **Etapa 1: testar opções do Puppeteer**

```ts
expect(page.pdf).toHaveBeenCalledWith(
  expect.objectContaining({
    path: expect.stringEndingWith('.tmp.pdf'),
    format: 'A4',
    landscape: true,
    printBackground: true,
  }),
);
```

Verificar `page.setContent(html, { waitUntil: 'load' })`, timeout, fechamento de página em sucesso/falha e ausência de arquivo final se `page.pdf` falhar.

- [ ] **Etapa 2: confirmar falha**

Executar: `npm test -- test/unit/pdf/pdf.service.spec.ts`

Esperado: FAIL.

- [ ] **Etapa 3: implementar browser provider e serviço**

Browser é compartilhado por processo do worker; cada job recebe página própria. Em desconexão, provider recria o browser no próximo uso. Após `page.pdf`, chamar `storage.commit(jobId)`.

- [ ] **Etapa 4: executar unidade**

Executar: `npm test -- test/unit/pdf/pdf.service.spec.ts`

Esperado: PASS.

- [ ] **Etapa 5: executar integração real do Chromium**

Executar: `npm run test:integration -- test/integration/pdf/pdf.service.spec.ts`

Esperado: arquivo inicia com `%PDF-`, tem tamanho maior que zero e não sobra `.tmp.pdf`.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/pdf test/unit/pdf test/integration/pdf
git commit -m "feat: generate reports with puppeteer"
```

---

### Tarefa 11: Orquestrar o worker e limitar repetições

**Arquivos:**

- Criar: `src/reports/report.processor.ts`
- Modificar: `src/reports/reports.module.ts`
- Modificar: `src/worker.module.ts`
- Testar: `test/unit/reports/report.processor.spec.ts`
- Testar: `test/integration/reports/report.pipeline.spec.ts`

**Interfaces:**

```ts
interface ReportProcessor {
  process(job: Job<GenerateReportJobData>): Promise<StoredReport>;
}
```

Pipeline exato:

```text
fetching-data -> processing-data -> rendering-html
-> generating-pdf -> ready
```

- [ ] **Etapa 1: escrever teste de ordem e progresso**

Mockar dependências e verificar a ordem `datapool -> select -> map -> build -> render -> generate`, com cada estado publicado antes da etapa correspondente.

- [ ] **Etapa 2: escrever teste de classificação de falhas**

Erro `retryable: true` deve ser relançado para BullMQ repetir. Erro determinístico deve usar `UnrecoverableError` para impedir repetição. Em toda falha, remover temporário do job.

- [ ] **Etapa 3: confirmar falha**

Executar: `npm test -- test/unit/reports/report.processor.spec.ts`

Esperado: FAIL.

- [ ] **Etapa 4: implementar processor**

Não colocar transformação de domínio no processor; ele apenas orquestra serviços. O retorno contém `StoredReport`, usado pelo presenter do status.

- [ ] **Etapa 5: testar pipeline com fixture**

Executar: `npm run test:integration -- test/integration/reports/report.pipeline.spec.ts`

Esperado: job chega a `ready`, resultado contém `expiresAt`, PDF existe e Redis não contém JSON completo.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/reports/report.processor.ts src/reports/reports.module.ts src/worker.module.ts test/unit/reports/report.processor.spec.ts test/integration/reports/report.pipeline.spec.ts
git commit -m "feat: orchestrate battery report pipeline"
```

---

### Tarefa 12: Status, download e semântica de expiração

**Arquivos:**

- Modificar: `src/reports/reports.service.ts`
- Modificar: `src/reports/report-status.presenter.ts`
- Modificar: `src/reports/reports.controller.ts`
- Testar: `test/unit/reports/report-status.presenter.spec.ts`
- Testar: `test/e2e/reports.e2e-spec.ts`

**Interfaces:**

```ts
interface ReportsService {
  create(command: CreateReportCommand): Promise<QueuedReport>;
  getStatus(jobId: string): Promise<PublicReportStatus>;
  openDownload(jobId: string): Promise<{
    stream: NodeJS.ReadableStream;
    fileName: string;
  }>;
}
```

- [ ] **Etapa 1: testar respostas por estado**

Cobrir `queued`, progresso intermediário, `ready`, `failed`, ID desconhecido e `expired`. Um job concluído cujo `expiresAt` passou deve ser apresentado como `expired`, mesmo antes do cleaner físico executar.

- [ ] **Etapa 2: testar download HTTP**

```ts
await request(app.getHttpServer())
  .get(`/reports/${jobId}/download`)
  .expect('Content-Type', /application\/pdf/)
  .expect('Content-Disposition', /attachment/)
  .expect(200);
```

Repetir antes de 30 minutos. Depois avançar o relógio e esperar `410 Gone` com `REPORT_EXPIRED`. Antes de `ready`, esperar `409 Conflict`.

- [ ] **Etapa 3: confirmar falha**

Executar: `npm run test:e2e -- test/e2e/reports.e2e-spec.ts`

Esperado: FAIL.

- [ ] **Etapa 4: implementar status e download**

Mapear erros públicos por filtro global. Usar stream com tratamento de erro e não carregar o PDF inteiro em memória.

- [ ] **Etapa 5: executar testes**

Executar: `npm test -- test/unit/reports/report-status.presenter.spec.ts`

Executar: `npm run test:e2e -- test/e2e/reports.e2e-spec.ts`

Esperado: PASS.

- [ ] **Etapa 6: registrar a entrega**

```bash
git add src/reports src/common/errors test/unit/reports/report-status.presenter.spec.ts test/e2e/reports.e2e-spec.ts
git commit -m "feat: expose expiring report downloads"
```

---

### Tarefa 13: Health, rate limit, logs e Docker

**Arquivos:**

- Criar: `src/health/health.service.ts`
- Criar: `src/health/health.controller.ts`
- Criar: `src/health/health.module.ts`
- Criar: `src/common/logging/log-context.ts`
- Modificar: `src/app.module.ts`
- Criar: `Dockerfile`
- Criar: `docker-compose.yml`
- Testar: `test/e2e/health.e2e-spec.ts`
- Testar: `test/e2e/rate-limit.e2e-spec.ts`

**Interfaces:**

```ts
interface HealthResponse {
  status: 'ok' | 'degraded';
  checks: {
    redis: 'up' | 'down';
    storage: 'up' | 'down';
    puppeteerEnvironment: 'up' | 'down';
    datapool: 'up' | 'down' | 'unknown';
  };
}
```

- [ ] **Etapa 1: escrever testes de health**

Falha da datapool deve produzir `degraded`, mas não impedir o processo de responder. Falha de Redis ou storage deve aparecer explicitamente.

- [ ] **Etapa 2: escrever testes de rate limit**

Configurar limites distintos para `POST /reports`, status e download. O teste deve confirmar `429` após o limite e headers de retry.

- [ ] **Etapa 3: confirmar falha**

Executar: `npm run test:e2e -- test/e2e/health.e2e-spec.ts test/e2e/rate-limit.e2e-spec.ts`

Esperado: FAIL.

- [ ] **Etapa 4: implementar health e logs**

Logs contêm `requestId`, `jobId`, rota, status, duração e código de erro. Não registrar `raw`, documento completo ou conteúdo do PDF.

- [ ] **Etapa 5: implementar containers**

`pdf-api` inicia `dist/main.js`; `pdf-worker` inicia `dist/worker.js`; ambos montam o mesmo volume de relatórios; Redis não publica porta fora do ambiente por padrão. Incluir healthchecks e shutdown gracioso.

- [ ] **Etapa 6: verificar Docker**

Executar: `docker compose config`

Esperado: configuração válida.

Executar: `docker compose up --build -d`

Executar: `docker compose ps`

Esperado: três serviços saudáveis.

- [ ] **Etapa 7: registrar a entrega**

```bash
git add src/health src/common/logging src/app.module.ts Dockerfile docker-compose.yml test/e2e/health.e2e-spec.ts test/e2e/rate-limit.e2e-spec.ts
git commit -m "chore: add production runtime safeguards"
```

---

### Tarefa 14: Homologação funcional e visual

**Arquivos:**

- Criar: `test/e2e/report-lifecycle.e2e-spec.ts`
- Criar: `test/visual/README.md`
- Criar: `docs/operations.md`
- Modificar: `.env.example`
- Modificar: `package.json`

**Interfaces:**

- Consome todos os módulos anteriores.
- Produz um fluxo verificável e documentação operacional; não cria novas regras de domínio.

- [ ] **Etapa 1: criar matriz de aceite automatizada**

```ts
it.each(['3h', '3d', '7d'] as const)(
  'gera e expira relatório de %s',
  async (period) => {
    const job = await createReport({ farmSlug: 'entre-rios', period });
    const ready = await waitUntilReady(job.jobId);
    await expectPdfDownload(ready.downloadUrl);
    clock.advanceBy(30 * 60 * 1000 + 1);
    await expectExpiredDownload(ready.downloadUrl);
  },
);
```

Adicionar relatório completo, seleção de ADDRs, JSON inválido, dado antigo, datapool indisponível e falha do Puppeteer.

- [ ] **Etapa 2: executar suíte completa**

Executar, um comando por vez:

```text
npm run lint
npm test
npm run test:integration
npm run test:e2e
npm run build
```

Esperado: todos os comandos com exit code 0.

- [ ] **Etapa 3: homologar contra a datapool real**

Configurar `DATAPOOL_BASE_URL` fora do repositório, criar um job para cada período e confirmar pelos logs da API de cálculo que somente endpoints GET de leitura foram usados.

- [ ] **Etapa 4: homologar visualmente**

Gerar PDFs novo e antigo com a mesma fazenda/período. Comparar capa, resumo, cards, agrupamentos, tabelas, mini gráficos, quebras de página, A4 paisagem, cores e textos. Registrar diferenças aceitas no `test/visual/README.md`; corrigir diferenças não aceitas antes do aceite.

- [ ] **Etapa 5: documentar operação**

`docs/operations.md` deve descrever variáveis, inicialização, health, criação/status/download, prazo de 30 minutos, limpeza, logs, falhas comuns e procedimento de atualização.

- [ ] **Etapa 6: verificar ausência de superfícies proibidas**

Executar:

```bash
rg -n "ssh|mysql|run-all|/run|sensor|actuator|s3|minio" src package.json docker-compose.yml
```

Esperado: nenhuma dependência ou rota proibida; ocorrências legítimas apenas em mensagens/documentação explicitamente revisadas.

- [ ] **Etapa 7: registrar a entrega**

```bash
git add test/e2e/report-lifecycle.e2e-spec.ts test/visual/README.md docs/operations.md .env.example package.json
git commit -m "test: verify battery pdf report lifecycle"
```

---

## Ordem de entrega e gates

1. Tarefas 1–3 estabelecem fundação e contrato externo.
2. Tarefas 4–6 entregam API, fila e modelo interno sem renderização.
3. Tarefas 7–8 portam o comportamento visual antigo de forma isolada.
4. Tarefas 9–12 completam armazenamento, Puppeteer, worker e download.
5. Tarefas 13–14 fecham operação, segurança e homologação.

Cada tarefa termina com testes próprios. Não iniciar portabilidade visual antes de o contrato da datapool e o modelo interno estarem estáveis. Não ligar o worker ao Puppeteer antes de storage e renderer possuírem testes independentes.

## Definição de concluído

A implementação está concluída somente quando:

- os três períodos geram PDF;
- filtro ausente inclui todos os dispositivos;
- filtro presente inclui exatamente os ADDRs solicitados;
- cada POST cria job e PDF novos;
- o PDF pode ser baixado mais de uma vez por 30 minutos;
- após 30 minutos, status e download indicam expiração;
- cleaner remove PDF final e temporários abandonados;
- Redis não contém JSON ou PDF completo;
- falhas de contrato e dados antigos não geram arquivo;
- somente falhas transitórias são repetidas;
- nenhum acesso SSH, MySQL ou endpoint de execução existe;
- toda a suíte automatizada passa;
- o PDF é homologado visualmente contra o modelo antigo.
