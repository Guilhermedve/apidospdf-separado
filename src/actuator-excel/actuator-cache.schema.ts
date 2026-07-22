import { z } from 'zod';

const isoTimestampSchema = z.string().datetime({ offset: true });

const actuatorRowSchema = z
  .object({
    TIME: isoTimestampSchema,
    FLOW: z.number(),
    VOL: z.number(),
    NOTE: z.string().nullable(),
  })
  .strict();

const actuatorTableMapSchema = z.record(
  z.string().trim().min(1),
  z.array(actuatorRowSchema),
);

const actuatorSectorSchema = z
  .object({
    tables: actuatorTableMapSchema,
  })
  .strict();

const actuatorSummarySchema = z
  .object({
    tables: z.number().int().nonnegative(),
    rows: z.number().int().nonnegative(),
    totalTables: z.number().int().nonnegative(),
    tablesWithMatches: z.number().int().nonnegative(),
    totalRows: z.number().int().nonnegative(),
  })
  .strict();

const actuatorErrorSchema = z
  .object({
    table: z.string().trim().min(1),
    message: z.string().trim().min(1),
  })
  .strict();

const actuatorCacheDocumentSchema = z
  .object({
    farm: z.string().trim().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    generatedAt: isoTimestampSchema,
    windowStart: isoTimestampSchema,
    windowEnd: isoTimestampSchema,
    summary: actuatorSummarySchema,
    sectors: z.record(z.string().trim().min(1), actuatorSectorSchema),
    errors: z.array(actuatorErrorSchema).optional(),
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

    const tableEntries = Object.values(document.sectors).flatMap((sector) =>
      Object.entries(sector.tables),
    );
    const tableCount = tableEntries.length;
    const nonEmptyTableCount = tableEntries.filter(
      ([, rows]) => rows.length > 0,
    ).length;
    const rowCount = tableEntries.reduce((sum, [, rows]) => sum + rows.length, 0);

    if (document.summary.tables !== tableCount) {
      context.addIssue({
        code: 'custom',
        message: 'summary.tables must match returned tables',
        path: ['summary', 'tables'],
      });
    }

    if (document.summary.tablesWithMatches !== nonEmptyTableCount) {
      context.addIssue({
        code: 'custom',
        message: 'summary.tablesWithMatches must match non-empty tables',
        path: ['summary', 'tablesWithMatches'],
      });
    }

    if (document.summary.totalTables !== tableCount) {
      context.addIssue({
        code: 'custom',
        message: 'summary.totalTables must match returned tables',
        path: ['summary', 'totalTables'],
      });
    }

    if (document.summary.rows !== rowCount) {
      context.addIssue({
        code: 'custom',
        message: 'summary.rows must match returned rows',
        path: ['summary', 'rows'],
      });
    }

    if (document.summary.totalRows !== rowCount) {
      context.addIssue({
        code: 'custom',
        message: 'summary.totalRows must match returned rows',
        path: ['summary', 'totalRows'],
      });
    }
  });

export function parseActuatorCacheDocument(input: unknown): ActuatorCacheDocument {
  const result = actuatorCacheDocumentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid actuator cache document: ${details}`);
  }
  return result.data;
}

export type ActuatorRow = z.infer<typeof actuatorRowSchema>;
export type ActuatorTableMap = z.infer<typeof actuatorTableMapSchema>;
export type ActuatorSector = z.infer<typeof actuatorSectorSchema>;
export type ActuatorCacheDocument = z.infer<
  typeof actuatorCacheDocumentSchema
>;