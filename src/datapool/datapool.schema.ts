import { z } from 'zod';

export const reportPeriodSchema = z.enum(['3h', '3d', '7d']);

const datapoolFarmDiscoverySchema = z.array(
  z.object({
    name: z.string().trim().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    periods: z.object({
      '3h': z.boolean(),
      '3d': z.boolean(),
      '7d': z.boolean(),
    }),
  }),
);

export function parseDatapoolFarmDiscovery(input: unknown): FarmDiscovery {
  const result = datapoolFarmDiscoverySchema.safeParse(input);
  if (!result.success) {
    throw new Error('Invalid datapool farm discovery');
  }

  return {
    farms: result.data.flatMap((farm) => {
      const periods = reportPeriodSchema.options.filter(
        (period) => farm.periods[period],
      );
      return periods.length > 0
        ? [{ slug: farm.slug, name: farm.name, periods }]
        : [];
    }),
  };
}

export interface FarmDiscovery {
  farms: Array<{
    slug: string;
    name: string;
    periods: ReportPeriod[];
  }>;
}

const isoTimestampSchema = z.string().datetime({ offset: true });

const rawBatteryRowSchema = z
  .object({
    time: isoTimestampSchema,
    addr: z.number().int().min(0).max(999),
    version: z.string(),
    rawBat: z.number(),
    bat: z.number(),
    ttl: z.number(),
    ack: z.number(),
    retry: z.number(),
    statRf: z.number(),
    uptime: z.number(),
    uuid: z.string(),
    note: z.string().nullable(),
  })
  .strict();

const batteryStatsSchema = z
  .object({
    totalRows: z.number().int().nonnegative(),
    validBatteryRows: z.number().int().nonnegative(),
    minBat: z.number().nullable(),
    maxBat: z.number().nullable(),
    avgBat: z.number().nullable(),
    attentionVoltageRows: z.number().int().nonnegative(),
    riskVoltageRows: z.number().int().nonnegative(),
    criticalVoltageRows: z.number().int().nonnegative(),
    chargedRows: z.number().int().nonnegative(),
    minRawBat: z.number().nullable(),
    maxRawBat: z.number().nullable(),
  })
  .strict();

const dailyHealthSchema = z
  .object({
    day: z.string().date(),
    sampleCount: z.number().int().nonnegative(),
    minBat: z.number(),
    maxBat: z.number(),
    avgBat: z.number(),
    charged: z.boolean(),
    lowVoltageSamples: z.number().int().nonnegative(),
    criticalVoltageSamples: z.number().int().nonnegative(),
    lowVoltagePercent: z.number().nonnegative(),
    overnightDrop: z.number().nullable(),
    socScore: z.number(),
    deepDischargeSamples: z.number().int().nonnegative(),
    riskVoltageSamples: z.number().int().nonnegative(),
    attentionVoltageSamples: z.number().int().nonnegative(),
    dayScore: z.number(),
    diagnosis: z.string(),
  })
  .strict();

const brownoutSignalSchema = z
  .object({
    resets: z.number().int().nonnegative(),
    detected: z.boolean(),
  })
  .strict();

const chargeTrendSignalSchema = z
  .object({
    // O contrato real envia null quando não há tendência estimada.
    slopePerDay: z.number().nullable(),
    days: z.number().int().nonnegative(),
    declining: z.boolean(),
  })
  .strict();

const healthSignalsSchema = z
  .object({
    brownout: brownoutSignalSchema,
    chargeTrend: chargeTrendSignalSchema,
  })
  .strict();

const batteryHealthSchema = z
  .object({
    healthScore: z.number(),
    lifeStatus: z.string(),
    diagnosis: z.string(),
    confidence: z.string(),
    reasons: z.array(z.string()),
    validDays: z.number().int().nonnegative(),
    daily: z.array(dailyHealthSchema),
    // Sinais ortogonais ao diagnosis (INTEGRATION.md §4). A API real sempre
    // envia; snapshots antigos/fixtures podem omitir, por isso default/optional.
    flags: z.array(z.string()).default([]),
    signals: healthSignalsSchema.optional(),
  })
  .strict();

const legacyBatterySchema = z
  .object({
    minBat: z.number(),
    baixaPercent: z.number(),
    eficiencia: z.number(),
    ciclos: z.number(),
    statusBateria: z.string(),
    motivoBateria: z.string(),
    statusCarga: z.string(),
    motivoCarga: z.string(),
    performance: z.number(),
  })
  .strict();

const datapoolDeviceSchema = z
  .object({
    addr: z.number().int().min(0).max(999),
    table: z.string().min(1),
    model: z.string(),
    modelType: z.string(),
    classification: z.string(),
    primaryFunctionLabel: z.string(),
    status: z.string(),
    errorMessage: z.string().nullable(),
    stats: batteryStatsSchema,
    health: batteryHealthSchema,
    legacy: legacyBatterySchema.nullable(),
    raw: z.array(rawBatteryRowSchema),
  })
  .strict()
  .superRefine((device, context) => {
    if (device.stats.totalRows !== device.raw.length) {
      context.addIssue({
        code: 'custom',
        message: 'stats.totalRows must match raw length',
        path: ['stats', 'totalRows'],
      });
    }
  });

const datapoolPeriodDocumentSchema = z
  .object({
    farm: z.string().trim().min(1),
    period: reportPeriodSchema,
    generatedAt: isoTimestampSchema,
    windowStart: isoTimestampSchema,
    windowEnd: isoTimestampSchema,
    // Frescor informado pela origem (INTEGRATION.md §5). Opcional: a API atual
    // ainda não emite; quando presente, o cliente o respeita.
    stale: z.boolean().optional(),
    devices: z.record(z.string().regex(/^\d{3}$/), datapoolDeviceSchema),
    summary: z
      .object({
        totalDevices: z.number().int().nonnegative(),
        readyDevices: z.number().int().nonnegative(),
        failedDevices: z.number().int().nonnegative(),
        totalRows: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine((document, context) => {
    if (Date.parse(document.windowStart) >= Date.parse(document.windowEnd)) {
      context.addIssue({
        code: 'custom',
        message: 'windowStart must be before windowEnd',
        path: ['windowStart'],
      });
    }

    const entries = Object.entries(document.devices);
    for (const [key, device] of entries) {
      const normalizedAddr = String(device.addr).padStart(3, '0');
      if (key !== normalizedAddr) {
        context.addIssue({
          code: 'custom',
          message: `device key ${key} does not match addr ${device.addr}`,
          path: ['devices', key, 'addr'],
        });
      }
    }

    if (document.summary.totalDevices !== entries.length) {
      context.addIssue({
        code: 'custom',
        message: 'summary.totalDevices must match devices count',
        path: ['summary', 'totalDevices'],
      });
    }

    if (
      document.summary.readyDevices + document.summary.failedDevices !==
      document.summary.totalDevices
    ) {
      context.addIssue({
        code: 'custom',
        message: 'readyDevices plus failedDevices must match totalDevices',
        path: ['summary'],
      });
    }

    const totalRows = entries.reduce(
      (sum, [, device]) => sum + device.raw.length,
      0,
    );
    if (document.summary.totalRows !== totalRows) {
      context.addIssue({
        code: 'custom',
        message: 'summary.totalRows must match device rows',
        path: ['summary', 'totalRows'],
      });
    }
  });

export function parseDatapoolPeriodDocument(
  input: unknown,
): DatapoolPeriodDocument {
  const result = datapoolPeriodDocumentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid datapool period document: ${details}`);
  }

  return result.data;
}

export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export type DatapoolDevice = z.infer<typeof datapoolDeviceSchema>;
export type DatapoolPeriodDocument = z.infer<
  typeof datapoolPeriodDocumentSchema
>;
