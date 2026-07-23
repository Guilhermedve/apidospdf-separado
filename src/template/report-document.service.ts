import { Injectable } from '@nestjs/common';
import { BatteryReportMapper } from '../battery/battery-report.mapper';
import { DeviceSelectionService } from '../battery/device-selection.service';
import type { DatapoolPeriodDocument } from '../datapool/datapool.types';
import type { ReportType } from '../reports/report-job.types';
import { ReportDataBuilder } from './report-data.builder';
import { ReportHtmlRenderer } from './report-html.renderer';
import { ReportViewModelBuilder } from './report-view-model.builder';

@Injectable()
export class ReportDocumentService {
  constructor(
    private readonly deviceSelection: DeviceSelectionService,
    private readonly reportMapper: BatteryReportMapper,
    private readonly viewModelBuilder: ReportViewModelBuilder,
    private readonly dataBuilder: ReportDataBuilder,
    private readonly htmlRenderer: ReportHtmlRenderer,
  ) {}

  render(
    document: DatapoolPeriodDocument,
    requestedAddrs?: string[],
    reportType: ReportType = 'detailed',
  ): string {
    const selectedDevices = this.deviceSelection.select(
      document,
      requestedAddrs,
    );
    const reportData = this.reportMapper.map(document, selectedDevices);

    if (reportType === 'simple') {
      return this.htmlRenderer.renderSimple(
        this.dataBuilder.buildSimple(reportData),
      );
    }

    const viewModel = this.viewModelBuilder.build(reportData);
    return this.htmlRenderer.render(viewModel);
  }
}
