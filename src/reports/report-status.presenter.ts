import type { ErrorCode } from '../common/errors/error-codes';
import type {
  PublicReportStatus,
  ReportJobSnapshot,
} from './report-job.types';

const publicErrorMessages: Record<ErrorCode, string> = {
  ACTUATOR_CACHE_NOT_FOUND:
    'O cache de atuadores solicitado não foi encontrado.',
  ACTUATOR_CACHE_TIMEOUT:
    'A consulta do cache de atuadores excedeu o tempo limite.',
  ACTUATOR_CACHE_UNAVAILABLE:
    'O cache de atuadores está temporariamente indisponível.',
  ACTUATOR_CONTRACT_INVALID:
    'O cache de atuadores retornou dados inválidos.',
  ACTUATOR_TOO_LARGE:
    'O cache de atuadores excede o limite de linhas do Excel.',
  EXCEL_GENERATION_FAILED:
    'Não foi possível gerar o arquivo Excel de atuadores.',
  DATAPOOL_CONTRACT_INVALID:
    'Os dados recebidos da fazenda estão em um formato inválido.',
  DATAPOOL_DATA_STALE: 'Os dados disponíveis da fazenda estão desatualizados.',
  DATAPOOL_UNAVAILABLE:
    'Os dados da fazenda estão temporariamente indisponíveis.',
  DEVICE_NOT_FOUND: 'Um ou mais dispositivos solicitados não foram encontrados.',
  FARM_NOT_FOUND: 'A fazenda solicitada não foi encontrada.',
  INVALID_REQUEST: 'A solicitação do relatório é inválida.',
  PDF_GENERATION_FAILED: 'Não foi possível gerar o arquivo PDF.',
  REPORT_EXPIRED: 'O relatório expirou e não está mais disponível.',
  REPORT_NOT_FOUND: 'O relatório solicitado não foi encontrado.',
  REPORT_NOT_READY: 'O relatório ainda não está pronto para download.',
};

export function presentReportStatus(
  snapshot: ReportJobSnapshot,
): PublicReportStatus {
  if (snapshot.state === 'ready' && snapshot.result) {
    return {
      jobId: snapshot.jobId,
      status: 'done',
      downloadUrl: `/reports/${encodeURIComponent(snapshot.jobId)}/download`,
      generatedAt: snapshot.result.generatedAt,
      expiresAt: snapshot.result.expiresAt,
    };
  }

  if (snapshot.state === 'failed' && snapshot.errorCode) {
    return {
      jobId: snapshot.jobId,
      status: 'failed',
      errorCode: snapshot.errorCode,
      message: publicErrorMessages[snapshot.errorCode],
    };
  }

  return {
    jobId: snapshot.jobId,
    status: snapshot.state === 'queued' ? 'queued' : 'processing',
  };
}
