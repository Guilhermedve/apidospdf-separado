import { z } from 'zod';

const isoTimestampSchema = z.string().datetime({ offset: true });

const actuatorRowSchema = z
  .object({
    TIME: isoTimestampSchema,
    ADDR: z.number().int(),
    NOTE: z.string(),
  })
  .strict();

const actuatorTablesSchema = z.record(
  z.string().trim().min(1),
  z.array(actuatorRowSchema),
);

const actuatorCacheDocumentSchema = z
  .object({
    farm: z.string().trim().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    generatedAt: isoTimestampSchema,
    windowStart: isoTimestampSchema,
    windowEnd: isoTimestampSchema,
    filter: z
      .object({
        column: z.string().trim().min(1),
        contains: z.string(),
      })
      .strict(),
    summary: z
      .object({
        totalTables: z.number().int().nonnegative(),
        tablesWithMatches: z.number().int().nonnegative(),
        totalRows: z.number().int().nonnegative(),
      })
      .strict(),
    tables: actuatorTablesSchema,
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

    const tables = Object.values(document.tables);
    if (document.summary.tablesWithMatches !== tables.length) {
      context.addIssue({
        code: 'custom',
        message: 'summary.tablesWithMatches must match returned tables',
        path: ['summary', 'tablesWithMatches'],
      });
    }

    if (document.summary.totalTables < document.summary.tablesWithMatches) {
      context.addIssue({
        code: 'custom',
        message: 'summary.totalTables cannot be lower than matched tables',
        path: ['summary', 'totalTables'],
      });
    }

    const totalRows = tables.reduce((sum, rows) => sum + rows.length, 0);
    if (document.summary.totalRows !== totalRows) {
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
export type ActuatorTableMap = z.infer<typeof actuatorTablesSchema>;
export type ActuatorCacheDocument = z.infer<
  typeof actuatorCacheDocumentSchema
>;
