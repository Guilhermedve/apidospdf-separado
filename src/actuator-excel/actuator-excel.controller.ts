import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  GatewayTimeoutException,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Res,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Writable } from 'node:stream';
import { ApplicationError } from '../common/errors/application-error';
import { ActuatorCacheClient } from './actuator-cache.client';
import {
  ActuatorWorkbookService,
  MAX_EXCEL_DATA_ROWS,
} from './actuator-workbook.service';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface DownloadResponse extends Writable {
  readonly headersSent: boolean;
  type(contentType: string): this;
  attachment(fileName: string): this;
}

@Controller('actuators/farms')
export class ActuatorExcelController {
  constructor(
    private readonly client: ActuatorCacheClient,
    private readonly workbook: ActuatorWorkbookService,
  ) {}

  @Get(':farm/excel')
  async download(
    @Param('farm') farm: string,
    @Res() response: DownloadResponse,
  ): Promise<void> {
    if (!SAFE_SLUG.test(farm)) {
      throw new BadRequestException('Slug de fazenda invalido');
    }

    let document;
    try {
      document = await this.client.getFarm(farm);
    } catch (error) {
      this.throwHttpError(error);
    }

    if (document.summary.totalRows > MAX_EXCEL_DATA_ROWS) {
      throw new UnprocessableEntityException(
        `O cache excede ${MAX_EXCEL_DATA_ROWS} linhas de dados`,
      );
    }

    response.type(XLSX_CONTENT_TYPE);
    response.attachment(`${farm}-atuadores.xlsx`);

    try {
      await this.workbook.write(document, response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      this.throwHttpError(error);
    }
  }

  private throwHttpError(error: unknown): never {
    if (!(error instanceof ApplicationError)) {
      throw error;
    }

    switch (error.code) {
      case 'ACTUATOR_CACHE_NOT_FOUND':
        throw new NotFoundException(error.message);
      case 'ACTUATOR_CACHE_TIMEOUT':
        throw new GatewayTimeoutException(error.message);
      case 'ACTUATOR_CACHE_UNAVAILABLE':
        throw new ServiceUnavailableException(error.message);
      case 'ACTUATOR_CONTRACT_INVALID':
        throw new BadGatewayException(error.message);
      case 'ACTUATOR_TOO_LARGE':
        throw new UnprocessableEntityException(error.message);
      case 'EXCEL_GENERATION_FAILED':
        throw new InternalServerErrorException(error.message);
      default:
        throw error;
    }
  }
}
