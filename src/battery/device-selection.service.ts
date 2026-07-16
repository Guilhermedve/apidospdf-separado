import { Injectable } from '@nestjs/common';
import { ApplicationError } from '../common/errors/application-error';
import type {
  DatapoolDevice,
  DatapoolPeriodDocument,
} from '../datapool/datapool.types';

@Injectable()
export class DeviceSelectionService {
  select(
    document: DatapoolPeriodDocument,
    requestedAddrs?: string[],
  ): DatapoolDevice[] {
    if (!requestedAddrs) {
      return Object.values(document.devices);
    }

    return requestedAddrs.map((addr) => {
      const device = document.devices[addr];
      if (!device) {
        throw new ApplicationError(
          'DEVICE_NOT_FOUND',
          `Device ${addr} was not found in the datapool document`,
          false,
        );
      }

      return device;
    });
  }
}
