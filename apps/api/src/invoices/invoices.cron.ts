import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoicesCron {
  private readonly logger = new Logger(InvoicesCron.name);

  constructor(private readonly invoicesService: InvoicesService) {}

  // 23:00 on days 28-31; only proceeds when tomorrow is the 1st
  // ("hoá đơn tạo vào ngày cuối cùng của tháng", người thuê trả đầu tháng sau)
  @Cron('0 0 23 28-31 * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleEndOfMonth(): Promise<void> {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (tomorrow.getDate() !== 1) return; // not the last day of the month

    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const result = await this.invoicesService.generateForMonth(month, year);
    this.logger.log(
      `Auto-generated invoices for ${month}/${year}: created=${result.created}, skipped=${result.skipped}`,
    );
  }
}
