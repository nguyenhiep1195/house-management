import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user';
import { CreateFeeSettingDto } from './dto/create-fee-setting.dto';
import { UpdateFeeSettingDto } from './dto/update-fee-setting.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  list() {
    return this.settingsService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateFeeSettingDto, @CurrentUser() user: AuthUser) {
    return this.settingsService.create(dto, user);
  }

  @Get(':id/history')
  getHistory(@Param('id', ParseIntPipe) id: number) {
    return this.settingsService.getHistory(id);
  }

  @Patch(':id/default')
  setDefault(@Param('id', ParseIntPipe) id: number) {
    return this.settingsService.setDefault(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeeSettingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settingsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.settingsService.remove(id);
  }
}
