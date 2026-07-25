import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesCron } from './invoices.cron';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [SettingsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesCron],
  exports: [InvoicesService],
})
export class InvoicesModule {}
