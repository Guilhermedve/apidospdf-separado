import { Injectable } from '@nestjs/common';
import { BatteryReportMapper } from '../battery/battery-report.mapper';
import { DeviceSelectionService } from '../battery/device-selection.service';
import type { DatapoolPeriodDocument } from '../datapool/datapool.types';
import { ReportHtmlRenderer } from './report-html.renderer';
import { ReportViewModelBuilder } from './report-view-model.builder';

@Injectable()
export class ReportDocumentService {
  constructor(
    private readonly deviceSelection: DeviceSelectionService,
    private readonly reportMapper: BatteryReportMapper,
    private readonly viewModelBuilder: ReportViewModelBuilder,
    private readonly htmlRenderer: ReportHtmlRenderer,
  ) {}

  render(
    document: DatapoolPeriodDocument,
    requestedAddrs?: string[],
  ): string {
    const selectedDevices = this.deviceSelection.select(
      document,
      requestedAddrs,
    );
    const reportData = this.reportMapper.map(document, selectedDevices);
    const viewModel = this.viewModelBuilder.build(reportData);
    return this.htmlRenderer.render(viewModel);
  }
}
