import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '../generated/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/types/auth-user';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get();
  }

  @Roles(Role.ADMIN)
  @Get('history')
  getHistory() {
    return this.settingsService.getHistory();
  }

  @Roles(Role.ADMIN)
  @Patch()
  update(@Body() dto: UpdateSettingDto, @CurrentUser() user: AuthUser) {
    return this.settingsService.update(dto, user);
  }
}
