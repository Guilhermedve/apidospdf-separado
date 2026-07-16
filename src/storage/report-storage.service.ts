import { Inject, Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  utimes,
} from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { ApplicationError } from '../common/errors/application-error';
import { AppConfigService } from '../config/app-config.service';
import type { Clock } from '../datapool/datapool.types';
import type { ReportArtifactMetadata } from '../reports/report-job.types';

export type StoredReport = ReportArtifactMetadata;

@Injectable()
export class ReportStorageService {
  private readonly rootPath: string;

  constructor(
    private readonly configService: AppConfigService,
    @Inject('STORAGE_CLOCK') private readonly clock: Clock,
  ) {
    this.rootPath = resolve(configService.value.reportsStoragePath);
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.rootPath, { recursive: true });
  }

  temporaryPath(jobId: string): string {
    return this.pathFor(jobId, '.tmp.pdf');
  }

  finalPath(jobId: string): string {
    return this.pathFor(jobId, '.pdf');
  }

  async commit(jobId: string): Promise<StoredReport> {
    await mkdir(this.rootPath, { recursive: true });
    const temporaryPath = this.temporaryPath(jobId);
    const finalPath = this.finalPath(jobId);
    await rename(temporaryPath, finalPath);

    const generatedAt = this.clock.now();
    await utimes(finalPath, generatedAt, generatedAt);
    const expiresAt = new Date(
      generatedAt.getTime() +
        this.configService.value.reportRetentionMinutes * 60_000,
    );

    return {
      fileName: `${jobId}.pdf`,
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async open(jobId: string): Promise<Readable> {
    const path = this.finalPath(jobId);
    await stat(path);
    return createReadStream(path);
  }

  async remove(jobId: string): Promise<void> {
    await Promise.all([
      rm(this.temporaryPath(jobId), { force: true }),
      rm(this.finalPath(jobId), { force: true }),
    ]);
  }

  async cleanExpired(referenceDate: Date): Promise<number> {
    await mkdir(this.rootPath, { recursive: true });
    const entries = await readdir(this.rootPath, { withFileTypes: true });
    const cutoff =
      referenceDate.getTime() -
      this.configService.value.reportRetentionMinutes * 60_000;
    let removed = 0;

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !/^[A-Za-z0-9_-]+(?:\.tmp)?\.pdf$/.test(entry.name)
      ) {
        continue;
      }

      const path = resolve(this.rootPath, entry.name);
      const fileStat = await stat(path);
      if (fileStat.mtimeMs <= cutoff) {
        await rm(path, { force: true });
        removed += 1;
      }
    }

    return removed;
  }

  private pathFor(jobId: string, suffix: '.pdf' | '.tmp.pdf'): string {
    if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
      throw new ApplicationError(
        'INVALID_REQUEST',
        'Report job id contains unsafe characters',
        false,
      );
    }

    const path = resolve(this.rootPath, `${jobId}${suffix}`);
    if (!path.startsWith(`${this.rootPath}${sep}`)) {
      throw new ApplicationError(
        'INVALID_REQUEST',
        'Report path is outside the configured storage directory',
        false,
      );
    }
    return path;
  }
}
