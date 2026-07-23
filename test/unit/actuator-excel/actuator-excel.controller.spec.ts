import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PassThrough } from 'node:stream';
import { ActuatorExcelController } from '../../../src/actuator-excel/actuator-excel.controller';
import { parseActuatorCacheDocument } from '../../../src/actuator-excel/actuator-cache.schema';
import { ApplicationError } from '../../../src/common/errors/application-error';

const fixture = require('../../fixtures/actuator-excel/maringa-citrosuco-new-contract.json') as unknown;
const document = parseActuatorCacheDocument(fixture);

class FakeClient {
  requestedSlug?: string;
  error?: Error;

  async getFarm(slug: string) {
    this.requestedSlug = slug;
    if (this.error) throw this.error;
    return document;
  }
}

class FakeWorkbookService {
  writtenDocument?: unknown;
  writtenOutput?: unknown;

  async write(input: unknown, output: unknown) {
    this.writtenDocument = input;
    this.writtenOutput = output;
    return { rows: 1 };
  }
}

class FakeResponse extends PassThrough {
  contentType?: string;
  fileName?: string;

  type(value: string) {
    this.contentType = value;
    return this;
  }

  attachment(value: string) {
    this.fileName = value;
    return this;
  }
}

describe('ActuatorExcelController', () => {
  it('baixa o workbook com nome e tipo corretos', async () => {
    const client = new FakeClient();
    const workbook = new FakeWorkbookService();
    const controller = new ActuatorExcelController(
      client as never,
      workbook as never,
    );
    const response = new FakeResponse();

    await controller.download('central-af', response as never);

    expect(client.requestedSlug).toBe('central-af');
    expect(response.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.fileName).toBe('central-af-atuadores.xlsx');
    expect(workbook.writtenDocument).toBe(document);
    expect(workbook.writtenOutput).toBe(response);
  });

  it('rejeita slug inseguro antes de consultar a origem', async () => {
    const client = new FakeClient();
    const controller = new ActuatorExcelController(
      client as never,
      new FakeWorkbookService() as never,
    );

    await expect(
      controller.download('../central', new FakeResponse() as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.requestedSlug).toBeUndefined();
  });

  it('traduz cache inexistente para 404', async () => {
    const client = new FakeClient();
    client.error = new ApplicationError(
      'ACTUATOR_CACHE_NOT_FOUND',
      'not found',
      false,
    );
    const controller = new ActuatorExcelController(
      client as never,
      new FakeWorkbookService() as never,
    );

    await expect(
      controller.download('central-af', new FakeResponse() as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita volume excedido antes de definir headers de sucesso', async () => {
    const client = new FakeClient();
    const oversized = structuredClone(document);
    oversized.summary.totalRows = 1_048_576;
    client.getFarm = async (slug: string) => {
      client.requestedSlug = slug;
      return oversized;
    };
    const response = new FakeResponse();
    const controller = new ActuatorExcelController(
      client as never,
      new FakeWorkbookService() as never,
    );

    await expect(
      controller.download('central-af', response as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(response.contentType).toBeUndefined();
    expect(response.fileName).toBeUndefined();
  });
});
