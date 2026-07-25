import { Controller, Get, Query } from '@nestjs/common';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getStats(query.year, query.month);
  }
}
