import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { SettingsModule } from '../settings/settings.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [InvoicesModule, SettingsModule],
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
